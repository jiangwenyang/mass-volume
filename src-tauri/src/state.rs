//! 房间状态：分组、数据行、示例数据与落盘。

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// 单组最多行数。实验不会接近这个数，用来挡住异常的连续添加。
pub const MAX_ROWS: usize = 200;
/// 新建组时的行数，含第 0 行原点。
pub const DEFAULT_ROWS: usize = 5;
/// 第一次打开客户端时的组数。
pub const DEFAULT_GROUPS: usize = 9;
/// 状态文件的结构版本。读到更旧的文件时整体换成新示例，旧分组和旧示例不再沿用。
pub const STATE_VERSION: u32 = 3;

/// 默认组名，与参考表格的铜、铝、木三种材料各 3 组对应。
const DEFAULT_NAMES: [&str; DEFAULT_GROUPS] = [
    "第1组（铜）",
    "第2组（铜）",
    "第3组（铜）",
    "第4组（铝）",
    "第5组（铝）",
    "第6组（铝）",
    "第7组（木）",
    "第8组（木）",
    "第9组（木）",
];

/// 参考表格（探究物质质量与体积的关系 20261012.xlsx）里各组的体积与质量，首行为原点。
const SAMPLE: [([f64; DEFAULT_ROWS], [f64; DEFAULT_ROWS]); DEFAULT_GROUPS] = [
    ([0.0, 6.0, 8.0, 10.0, 20.0], [0.0, 50.26, 67.14, 83.99, 168.67]),
    ([0.0, 6.0, 10.0, 12.0, 20.0], [0.0, 50.31, 83.95, 100.86, 167.66]),
    ([0.0, 6.0, 12.0, 14.0, 20.0], [0.0, 50.33, 100.64, 117.39, 167.76]),
    ([0.0, 6.0, 8.0, 10.0, 20.0], [0.0, 16.52, 22.05, 28.39, 56.04]),
    ([0.0, 6.0, 10.0, 12.0, 20.0], [0.0, 17.0, 28.12, 34.09, 56.32]),
    ([0.0, 6.0, 12.0, 14.0, 20.0], [0.0, 17.09, 34.41, 40.13, 56.67]),
    ([0.0, 6.0, 8.0, 10.0, 20.0], [0.0, 3.29, 4.22, 5.36, 10.8]),
    ([0.0, 6.0, 10.0, 12.0, 20.0], [0.0, 3.13, 5.18, 6.63, 9.87]),
    ([0.0, 6.0, 12.0, 14.0, 20.0], [0.0, 3.18, 6.65, 7.43, 10.0]),
];

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
    /// 旧文件没有这个字段，读出来是 0。
    #[serde(default)]
    pub version: u32,
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
            version: STATE_VERSION,
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
    /// 从磁盘读取状态。文件缺失或损坏时使用默认房间；版本过旧时换成新示例并立即写回。
    ///
    /// # 参数
    /// - `path` - `state.json` 路径
    pub fn load(path: &Path) -> Self {
        let text = fs::read_to_string(path).ok();
        let Some(text) = text else {
            return Self::default();
        };
        match serde_json::from_str::<RoomState>(&text) {
            Ok(mut state) if state.version >= STATE_VERSION => {
                state.repair();
                state
            }
            Ok(_) => {
                let mut state = Self::default();
                state.load_sample();
                state.save(path);
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
        if row == 0 {
            return Err(StateError::Invalid("第 0 行是原点，体积和质量固定为 0".into()));
        }
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

    /// 删除一行。第 0 行原点不能删，每组至少保留一行。
    ///
    /// # 参数
    /// - `group_id` - 组 id
    /// - `row` - 要删除的下标
    pub fn remove_row(&mut self, group_id: &str, row: usize) -> Result<(), StateError> {
        let group = self
            .group_mut(group_id)
            .ok_or_else(|| StateError::Invalid("没有这一组".into()))?;
        if row == 0 {
            return Err(StateError::Invalid("原点行不能删除".into()));
        }
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
    /// - `names` - 与目标组数对齐的名称；缺省时保留原名或使用默认组名
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

    /// 清空全部单元格，保留分组、组名、行数和原点。
    pub fn reset(&mut self) {
        for group in &mut self.groups {
            for row in &mut group.rows {
                row.v = None;
                row.m = None;
            }
            if let Some(first) = group.rows.first_mut() {
                *first = origin_row();
            }
        }
    }

    /// 载入参考表格里的 9 组数据，组名一并换回默认。
    pub fn load_sample(&mut self) {
        self.groups.clear();
        self.next_id = 1;
        for (volumes, masses) in SAMPLE {
            let index = self.groups.len();
            let mut group = self.spawn_group(index);
            group.rows = volumes
                .iter()
                .zip(masses)
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
        let mut rows = vec![empty_row(); DEFAULT_ROWS];
        rows[0] = origin_row();
        Group {
            id: format!("g{id_number}"),
            name: default_name(index),
            rows,
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
                group.name = default_name(index);
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
            group.rows[0] = origin_row();
        }
        if self.next_id <= max_seen {
            self.next_id = max_seen.saturating_add(1);
        }
    }
}

/// 这一组除原点外是否已经写过体积或质量。
fn group_has_data(group: &Group) -> bool {
    group
        .rows
        .iter()
        .skip(1)
        .any(|row| row.v.is_some() || row.m.is_some())
}

/// 空白行。
fn empty_row() -> Row {
    Row { v: None, m: None }
}

/// 第 0 行的原点数据。
fn origin_row() -> Row {
    Row {
        v: Some(0.0),
        m: Some(0.0),
    }
}

/// 第 N 组的默认名称。前 9 组带材料，之后是「第 N 组」。
fn default_name(index: usize) -> String {
    DEFAULT_NAMES
        .get(index)
        .map(|name| (*name).to_string())
        .unwrap_or_else(|| format!("第{}组", index + 1))
}

/// 去掉空白并限制长度。空名称退回默认组名。
fn clean_name(name: &str, index: usize) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return default_name(index);
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
        state.patch("g6", 1, "v", Some(1.0)).unwrap();
        let error = state.set_groups(5, false, None).unwrap_err();
        assert!(matches!(error, StateError::NeedsConfirm(_)));
        assert_eq!(state.groups.len(), DEFAULT_GROUPS);
        state.set_groups(5, true, None).unwrap();
        assert_eq!(state.groups.len(), 5);
    }

    #[test]
    fn remove_keeps_the_origin_row() {
        let mut state = RoomState::default();
        let id = state.groups[0].id.clone();
        while state.groups[0].rows.len() > 1 {
            state.remove_row(&id, 1).unwrap();
        }
        let error = state.remove_row(&id, 0).unwrap_err();
        assert!(matches!(error, StateError::Invalid(_)));
        assert_eq!(state.groups[0].rows[0], origin_row());
    }

    #[test]
    fn patch_rejects_negative() {
        let mut state = RoomState::default();
        let error = state.patch("g1", 1, "m", Some(-1.0)).unwrap_err();
        assert!(matches!(error, StateError::Invalid(_)));
    }

    #[test]
    fn origin_row_is_fixed() {
        let mut state = RoomState::default();
        assert_eq!(state.groups[0].rows[0], origin_row());
        let error = state.patch("g1", 0, "v", Some(3.0)).unwrap_err();
        assert!(matches!(error, StateError::Invalid(_)));
        state.patch("g1", 1, "v", Some(6.0)).unwrap();
        state.reset();
        assert_eq!(state.groups[0].rows[0], origin_row());
        assert_eq!(state.groups[0].rows[1].v, None);
    }

    #[test]
    fn default_groups_carry_material_names() {
        let state = RoomState::default();
        assert_eq!(state.groups.len(), 9);
        assert_eq!(state.groups[0].name, "第1组（铜）");
        assert_eq!(state.groups[3].name, "第4组（铝）");
        assert_eq!(state.groups[8].name, "第9组（木）");
        assert!(!state.groups.iter().any(group_has_data));
    }

    #[test]
    fn old_files_are_replaced_by_sample() {
        let dir = std::env::temp_dir().join(format!("physics-lab-test-{}", now_ms()));
        let path = dir.join("state.json");
        fs::create_dir_all(&dir).unwrap();
        let old = r#"{"groups":[{"id":"g1","name":"第1组","rows":[{"v":6.0,"m":50.4}]}],"nextId":2,"updatedAt":0}"#;
        fs::write(&path, old).unwrap();
        let state = RoomState::load(&path);
        assert_eq!(state.version, STATE_VERSION);
        assert_eq!(state.groups.len(), 9);
        assert_eq!(state.groups[0].name, "第1组（铜）");
        assert_eq!(state.groups[0].rows[1].m, Some(50.26));
        let saved: RoomState = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved.version, STATE_VERSION);
        let _ = fs::remove_dir_all(dir);
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
        assert_eq!(state.groups[0].rows[1].m, Some(50.26));
        assert_eq!(state.groups[8].rows[4], Row { v: Some(20.0), m: Some(10.0) });
        assert!(state.groups.iter().all(|group| group.rows[0] == origin_row()));
    }
}
