import { onMounted, onUnmounted } from 'vue'

/**
 * 当前页面是否跑在桌面窗口里。平板浏览器没有这个对象。
 * @returns 在 Tauri 窗口内时为 true
 */
const inDesktop = (): boolean => '__TAURI_INTERNALS__' in window

/**
 * 桌面窗口按 Esc 退出全屏。已经是普通窗口、或正在输入法组字时不做事。
 * @param event - 键盘事件
 */
const exitOnEscape = async (event: KeyboardEvent): Promise<void> => {
  if (event.key !== 'Escape' || event.isComposing || !inDesktop()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const appWindow = getCurrentWindow()
  if (!(await appWindow.isFullscreen())) return
  await appWindow.setFullscreen(false)
}

/**
 * 监听 Esc，让启动时的全屏可以退回普通窗口。
 */
export const useEscapeFullscreen = (): void => {
  /**
   * 把按键交给退出全屏，失败时留在当前窗口。
   * @param event - 键盘事件
   */
  const onKey = (event: KeyboardEvent): void => {
    void exitOnEscape(event).catch(() => {})
  }

  onMounted(() => {
    if (!inDesktop()) return
    window.addEventListener('keydown', onKey)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
  })
}
