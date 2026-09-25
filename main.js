const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "디지펫 바이탈 링크 - 전용 에디터",
    backgroundColor: "#1E2124",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'editor.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 핸들러 1: project_data.js 로컬 파일 직접 저장 (다운로드 창 없이 즉시 저장)
ipcMain.handle('save-project-data', async (event, projectJson) => {
  try {
    const filePath = path.join(__dirname, 'project_data.js');
    const content = `// 디지펫 바이탈 링크 프로젝트 데이터\nwindow.DIGIPET_DEFAULT_DATA = ${projectJson};\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  } catch (err) {
    console.error('File save error:', err);
    return { success: false, error: err.message };
  }
});

// IPC 핸들러 2: GitHub Pages 원클릭 배포 실행
ipcMain.handle('deploy-to-netlify', async (event) => {
  return new Promise((resolve) => {
    // 1단계: make_deploy.py 패키징
    exec('python make_deploy.py', { cwd: __dirname }, (err1, stdout1, stderr1) => {
      if (err1) {
        return resolve({ success: false, step: 'packaging', error: stderr1 || err1.message });
      }

      // 2단계: git add -A
      exec('git add -A', { cwd: __dirname }, (errAdd) => {
        if (errAdd) {
          return resolve({ success: false, step: 'git add', error: errAdd.message });
        }

        // 3단계: git commit (변경사항이 없더라도 계속 진행)
        exec('git commit -m "Auto deploy update from Editor"', { cwd: __dirname }, () => {
          // 4단계: git push origin main
          exec('git push origin main', { cwd: __dirname }, (errPush, stdoutPush, stderrPush) => {
            if (errPush) {
              return resolve({ success: false, step: 'git push', error: stderrPush || errPush.message });
            }
            resolve({ success: true, log: stdoutPush });
          });
        });
      });
    });
  });
});
