export function updateContextRowHasContent(contextRowEl: HTMLElement): void {
  const editorIndicator = contextRowEl.querySelector('.aidian-selection-indicator');
  const browserIndicator = contextRowEl.querySelector('.aidian-browser-selection-indicator');
  const canvasIndicator = contextRowEl.querySelector('.aidian-canvas-indicator');
  const fileIndicator = contextRowEl.querySelector('.aidian-file-indicator');
  const imagePreview = contextRowEl.querySelector('.aidian-image-preview');

  const hasEditorSelection = !!editorIndicator && !editorIndicator.hasClass('aidian-hidden');
  const hasBrowserSelection = !!browserIndicator && !browserIndicator.hasClass('aidian-hidden');
  const hasCanvasSelection = !!canvasIndicator && !canvasIndicator.hasClass('aidian-hidden');
  const hasFileChips = !!fileIndicator && fileIndicator.hasClass('aidian-visible-flex');
  const hasImageChips = !!imagePreview && imagePreview.hasClass('aidian-visible-flex');

  contextRowEl.classList.toggle(
    'has-content',
    hasEditorSelection || hasBrowserSelection || hasCanvasSelection || hasFileChips || hasImageChips
  );
}
