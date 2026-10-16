//! 房间状态：分组、数据行、示例数据与落盘。

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// 单组最多行数。实验不会接近这个数，用来挡住异常的连续添加。
pub const MAX_ROWS: usize = 200;
/// 新建组时的空白行数。
pub const DEFAULT_ROWS: usize = 5;
/// 第一次打开客户端时的组数。
pub const DEFAULT_GROUPS: usize = 6;

/// 一行体积与质量。空单元格用 null。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Row {
    pub v: Option<f64>,
    pub m: Option<f64>,
}

/// 一个实验组。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub rows: Vec<Row>,
}

/// 整个教室的同步状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoomState {
    pub groups: Vec<Group>,
    #[serde(default)]
    pub next_id: u32,
    pub updated_at: i64,
}

/// 修改状态时的可恢复错误。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StateError {
    /// 缩小分组会丢掉已填写的数据，需要教师确认。
    NeedsConfirm(String),
    /// 请求本身不合法。
    Invalid(String),
}

impl Default for RoomState {
    fn default() -> Self {
        let mut state = Self {
            groups: Vec::new(),
            next_id: 1,
            updated_at: 0,
        };
        let _ = state.set_groups(DEFAULT_GROUPS, true, None);
        state.updated_at = now_ms();
        state
    }
}

impl RoomState {
    /// 从磁盘读取状态。文件缺失或损坏时使用默认房间。
    ///
    /// # 参数
    /// - `path` - `state.json` 路径
    pub fn load(path: &Path) -> Self {
        let text = fs::read_to_string(path).ok();
        let Some(text) = text else {
            return Self::default();
        };
        match serde_json::from_str::<RoomState>(&text) {
            Ok(mut state) => {
                state.repair();
                state
            }
            Err(_) => Self::default(),
        }
    }

    /// 把当前状态原子写入磁盘。
    ///
    /// # 参数
    /// - `path` - 目标文件
    pub fn save(&self, path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let Ok(text) = serde_json::to_string_pretty(self) else {
            return;
        };
        let tmp = temp_path(path);
        if fs::write(&tmp, text).is_ok() {
            let _ = fs::rename(tmp, path);
        }
    }

    /// 修改一个单元格。
    ///
    /// # 参数
    /// - `group_id` - 组 id
    /// - `row` - 行下标
    /// - `field` - `v` 或 `m`
    /// - `value` - 非负数字，`None` 表示清空
    pub fn patch(
        &mut self,
        group_id: &str,
        row: usize,
        field: &str,
        value: Option<f64>,
    ) -> Result<(), StateError> {
        let value = sanitize(value)?;
        let group = self
            .group_mut(group_id)
            .ok_or_else(|| StateError::Invalid("没有这一组".into()))?;
        let item = group
            .rows
            .get_mut(row)
            .ok_or_else(|| StateError::Invalid("没有这一行".into()))?;
        match field {
            "v" => item.v = value,
            "m" => item.m = value,
            _ => return Err(StateError::Invalid("只能修改体积或质量".into())),
        }
        Ok(())
    }

    /// 在组末尾追加一行空白。
    ///
    /// # 参数
    /// - `group_id` - 组 id
    pub fn add_row(&mut self, group_id: &str) -> Result<(), StateError> {
        let group = self
            .group_mut(group_id)
            .ok_or_else(|| StateError::Invalid("没有这一组".into()))?;
        if group.rows.len() >= MAX_ROWS {
            return Err(StateError::Invalid(format!("单组最多 {MAX_ROWS} 行")));
        }
        group.rows.push(empty_row());
        Ok(())
    }

    /// 删除一行。每组至少保留一行。
    ///
    /// # 参数
    /// - `group_id` - 组 id
    /// - `row` - 要删除的下标
    pub fn remove_row(&mut self, group_id: &str, row: usize) -> Result<(), StateError> {
        let group = self
            .group_mut(group_id)
            .ok_or_else(|| StateError::Invalid("没有这一组".into()))?;
        if group.rows.len() <= 1 {
            return Err(StateError::Invalid("至少保留一行".into()));
        }
        if row >= group.rows.len() {
            return Err(StateError::Invalid("没有这一行".into()));
        }
        group.rows.remove(row);
        Ok(())
    }

    /// 调整组数，并按顺序写回组名。
    ///
    /// # 参数
    /// - `count` - 目标组数，至少 1 组
    /// - `force` - 为真时允许删掉末尾已填写的组
    /// - `names` - 与目标组数对齐的名称；缺省时保留原名或使用「第 N 组」
    pub fn set_groups(
        &mut self,
        count: usize,
        force: bool,
        names: Option<Vec<String>>,
    ) -> Result<(), StateError> {
        if count < 1 {
            return Err(StateError::Invalid("至少保留 1 组".into()));
        }
        if count < self.groups.len() {
            let dropping = &self.groups[count..];
            if !force && dropping.iter().any(group_has_data) {
                return Err(StateError::NeedsConfirm(
                    "减少分组会删除末尾已填写的数据".into(),
                ));
            }
            self.groups.truncate(count);
        }
        while self.groups.len() < count {
            let index = self.groups.len();
            let group = self.spawn_group(index);
            self.groups.push(group);
        }
        if let Some(names) = names {
            for (index, name) in names.into_iter().enumerate() {
                if let Some(group) = self.groups.get_mut(index) {
                    group.name = clean_name(&name, index);
                }
            }
        }
        Ok(())
    }

    /// 清空全部单元格，保留分组、组名和行数。
    pub fn reset(&mut self) {
        for group in &mut self.groups {
            for row in &mut group.rows {
                row.v = None;
                row.m = None;
            }
        }
    }

    /// 载入原型里的 9 组走台数据。
    pub fn load_sample(&mut self) {
        self.groups.clear();
        self.next_id = 1;
        let volumes = [0.0, 6.0, 8.0, 10.0, 12.0];
        let masses = [
            [0.0, 50.4, 67.4, 84.4, 100.6],
            [0.0, 50.4, 67.4, 84.4, 100.6],
            [0.0, 50.4, 67.4, 84.4, 100.6],
            [0.0, 46.6, 62.2, 77.2, 93.2],
            [0.0, 46.6, 62.2, 77.2, 93.2],
            [0.0, 46.4, 62.0, 77.2, 93.2],
            [0.0, 17.0, 22.0, 27.4, 32.4],
            [0.0, 16.8, 21.8, 27.0, 32.6],
            [0.0, 17.0, 21.6, 27.2, 32.4],
        ];
        for mass in masses {
            let index = self.groups.len();
            let mut group = self.spawn_group(index);
            group.rows = volumes
                .iter()
                .zip(mass)
                .map(|(v, m)| Row { v: Some(*v), m: Some(m) })
                .collect();
            self.groups.push(group);
        }
    }

    /// 记下修改时间。
    pub fn touch(&mut self) {
        self.updated_at = now_ms();
    }

    /// 按 id 找到组。
    fn group_mut(&mut self, group_id: &str) -> Option<&mut Group> {
        self.groups.iter_mut().find(|group| group.id == group_id)
    }

    /// 生成一个带默认行数的新组，并消耗下一个 id。
    fn spawn_group(&mut self, index: usize) -> Group {
        let id_number = self.next_id.max(1);
        self.next_id = id_number.saturating_add(1);
        Group {
            id: format!("g{id_number}"),
            name: format!("第{}组", index + 1),
            rows: vec![empty_row(); DEFAULT_ROWS],
        }
    }

    /// 修正磁盘里可能残缺的结构。
    fn repair(&mut self) {
        if self.groups.is_empty() {
            *self = Self::default();
            return;
        }
        let mut max_seen = 0_u32;
        for (index, group) in self.groups.iter_mut().enumerate() {
            if group.id.is_empty() {
                group.id = format!("g{}", index + 1);
            }
            if let Some(number) = group.id.strip_prefix('g').and_then(|raw| raw.parse().ok()) {
                max_seen = max_seen.max(number);
            }
            if group.name.trim().is_empty() {
                group.name = format!("第{}组", index + 1);
            }
            if group.rows.is_empty() {
                group.rows.push(empty_row());
            }
            if group.rows.len() > MAX_ROWS {
                group.rows.truncate(MAX_ROWS);
            }
            for row in &mut group.rows {
                row.v = sanitize(row.v).ok().flatten();
                row.m = sanitize(row.m).ok().flatten();
            }
        }
        if self.next_id <= max_seen {
            self.next_id = max_seen.saturating_add(1);
        }
    }
}

/// 这一组是否已经写过体积或质量。
fn group_has_data(group: &Group) -> bool {
    group.rows.iter().any(|row| row.v.is_some() || row.m.is_some())
}

/// 空白行。
fn empty_row() -> Row {
    Row { v: None, m: None }
}

/// 去掉空白并限制长度。空名称退回「第 N 组」。
fn clean_name(name: &str, index: usize) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return format!("第{}组", index + 1);
    }
    trimmed.chars().take(20).collect()
}

/// 只接受有限的非负数，并收成 4 位小数。
fn sanitize(value: Option<f64>) -> Result<Option<f64>, StateError> {
    match value {
        None => Ok(None),
        Some(number) if number.is_finite() && number >= 0.0 => {
            Ok(Some((number * 10_000.0).round() / 10_000.0))
        }
        _ => Err(StateError::Invalid("请填写非负数字".into())),
    }
}

/// 当前时间的毫秒时间戳。
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// 同目录下的临时文件路径。
fn temp_path(path: &Path) -> PathBuf {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    PathBuf::from(tmp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shrink_asks_before_dropping_filled_groups() {
        let mut state = RoomState::default();
        state.patch("g6", 0, "v", Some(1.0)).unwrap();
        let error = state.set_groups(5, false, None).unwrap_err();
        assert!(matches!(error, StateError::NeedsConfirm(_)));
        assert_eq!(state.groups.len(), DEFAULT_GROUPS);
        state.set_groups(5, true, None).unwrap();
        assert_eq!(state.groups.len(), 5);
    }

    #[test]
    fn remove_keeps_the_last_row() {
        let mut state = RoomState::default();
        let id = state.groups[0].id.clone();
        while state.groups[0].rows.len() > 1 {
            state.remove_row(&id, 0).unwrap();
        }
        let error = state.remove_row(&id, 0).unwrap_err();
        assert!(matches!(error, StateError::Invalid(_)));
    }

    #[test]
    fn patch_rejects_negative() {
        let mut state = RoomState::default();
        let error = state.patch("g1", 0, "m", Some(-1.0)).unwrap_err();
        assert!(matches!(error, StateError::Invalid(_)));
    }

    #[test]
    fn groups_have_no_upper_bound() {
        let mut state = RoomState::default();
        state.set_groups(24, true, None).unwrap();
        assert_eq!(state.groups.len(), 24);
        assert_eq!(state.groups[23].name, "第24组");
        let error = state.set_groups(0, true, None).unwrap_err();
        assert!(matches!(error, StateError::Invalid(_)));
    }

    #[test]
    fn sample_replaces_groups() {
        let mut state = RoomState::default();
        state.load_sample();
        assert_eq!(state.groups.len(), 9);
        assert_eq!(state.groups[0].rows[1].m, Some(50.4));
    }
}
