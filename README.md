* {
  box-sizing: border-box;
}

:root {
  color-scheme: dark;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #111317;
  color: #edf2f7;
  line-height: 1.4;
  font-weight: 400;
}

html, body, #root {
  margin: 0;
  width: 100%;
  height: 100%;
  background: #111317;
}

body {
  min-height: 100vh;
  background: #111317;
}

button {
  font: inherit;
}

.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #111317;
  color: #edf2f7;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  padding: 0 18px;
  background: rgba(17, 19, 23, 0.98);
}

.title-block {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-name {
  font-size: 0.9rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #dfe7ea;
}

.document-name {
  font-size: 0.8rem;
  color: rgba(223, 231, 234, 0.7);
}

.file-menu {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-menu button,
.toolbar button,
.equation-actions button {
  padding: 7px 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(148, 163, 184, 0.04);
  color: #edf2f7;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.file-menu button:hover,
.toolbar button:hover,
.equation-actions button:hover,
.toolbar .active {
  border-color: rgba(138, 180, 255, 0.4);
  background: rgba(138, 180, 255, 0.1);
}

.workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

.toolbar {
  width: 90px;
  border-right: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(17, 19, 23, 0.9);
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 8px;
}

.toolbar button {
  width: 100%;
  text-align: center;
}

.canvas-panel {
  flex: 1;
  min-width: 0;
  background: #111317;
}

.canvas-surface {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: crosshair;
  user-select: none;
}

.canvas-surface svg {
  width: 100%;
  height: 100%;
  display: block;
  background: #111317;
}

.canvas-hint {
  position: absolute;
  left: 22px;
  bottom: 22px;
  font-size: 0.8rem;
  color: rgba(223, 231, 234, 0.7);
  background: rgba(17, 19, 23, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.14);
  padding: 8px 12px;
  border-radius: 6px;
}

.math-sidebar {
  width: 280px;
  border-left: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(17, 19, 23, 0.9);
  padding: 16px 12px;
}

.sidebar-header {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(223, 231, 234, 0.75);
  margin-bottom: 10px;
}

.equation-card {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 10px;
  background: rgba(148, 163, 184, 0.02);
  margin-bottom: 12px;
}

.equation-expression {
  font-size: 0.9rem;
  font-family: 'SFMono-Regular', Consolas, monospace;
  color: #edf2f7;
  margin-bottom: 6px;
}

.equation-status {
  font-size: 0.76rem;
  color: rgba(223, 231, 234, 0.7);
  margin-bottom: 8px;
}

.equation-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.math-footer {
  margin-top: 12px;
  font-size: 0.72rem;
  color: rgba(223, 231, 234, 0.6);
}

.hidden-input {
  display: none;
}

@media (max-width: 900px) {
  .math-sidebar {
    display: none;
  }

  .toolbar {
    width: 72px;
  }
}
