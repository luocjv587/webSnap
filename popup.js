console.log('WebSnap popup.js 开始加载...');

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOMContentLoaded 事件触发');
  
  const captureBtn = document.getElementById('captureBtn');
  const fullCaptureBtn = document.getElementById('fullCaptureBtn');
  const areaCaptureBtn = document.getElementById('areaCaptureBtn');
  const historyBtn = document.getElementById('historyBtn');
  const statusDiv = document.getElementById('status');

  console.log('DOM元素获取完成:', {
    captureBtn: !!captureBtn,
    historyBtn: !!historyBtn
  });

  let isCapturing = false;

  // 历史记录存储工具函数
  async function saveToHistory(url, title, type, captureResult = null) {
    try {
      console.log('开始保存历史记录:', { url, title, type, captureResult });
      
      const now = new Date();
      const filename = captureResult ? captureResult.filename : generateHistoryFilename(title, type);
      
      const historyItem = {
        id: Date.now().toString(),
        url: url,
        title: title,
        type: type, // 'normal' 或 'full'
        timestamp: now.toISOString(),
        filename: filename,
        date: now.toLocaleString('zh-CN'), // 预格式化的日期字符串
        downloadId: captureResult ? captureResult.downloadId : null,
        fullPath: captureResult ? captureResult.fullPath : null
      };
      
      // 获取现有历史记录
      const result = await chrome.storage.local.get(['screenshotHistory']);
      const history = result.screenshotHistory || [];
      console.log('当前历史记录数量:', history.length);
      
      // 添加新记录到开头
      history.unshift(historyItem);
      
      // 限制历史记录数量（最多保存50条）
      if (history.length > 50) {
        history.splice(50);
      }
      
      // 保存到storage
      await chrome.storage.local.set({ screenshotHistory: history });
      
      console.log('历史记录已保存:', historyItem.filename, '新的历史记录数量:', history.length);
    } catch (error) {
      console.error('保存历史记录失败:', error);
    }
  }

  function generateHistoryFilename(title, type) {
    const now = new Date();
    const timestamp = now.getFullYear() + 
      String(now.getMonth() + 1).padStart(2, '0') + 
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') + 
      String(now.getMinutes()).padStart(2, '0') + 
      String(now.getSeconds()).padStart(2, '0');
    
    const safeText = (title || '网页截图')
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
    
    const typeText = type === 'full' ? '_长截图' : type === 'area' ? '_区域截图' : '';
    return `${safeText}${typeText}_${timestamp}.png`;
  }

  function updateStatus(message, type = 'loading') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }

  // 移除停止按钮相关函数，因为不再需要
  // function showStopButton() {
  //   stopCaptureBtn.style.display = 'block';
  //   fullCaptureBtn.style.display = 'none';
  // }

  // function hideStopButton() {
  //   stopCaptureBtn.style.display = 'none';
  //   fullCaptureBtn.style.display = 'block';
  // }

  // 监听来自background script的进度更新
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateProgress') {
      if (isCapturing) {
        updateStatus(`正在截取第${request.current}/${request.total}段...`, 'loading');
      }
    } else if (request.action === 'captureComplete') {
      isCapturing = false;
      fullCaptureBtn.disabled = false;
      captureBtn.disabled = false;
      
      updateStatus(`✅ 长截图完成，共${request.segments}段`, 'success');
    }
  });

  // 普通截图功能
  captureBtn.addEventListener('click', async function() {
    try {
      updateStatus('正在截取网页...', 'loading');
      captureBtn.disabled = true;

      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 直接发送消息给background script进行截图和下载
      chrome.runtime.sendMessage({
        action: 'captureAndSave',
        url: tab.url,
        title: tab.title
      }, function(response) {
        if (response && response.success) {
          updateStatus('✅ 截图已保存！', 'success');
          
          // 保存到历史记录
          saveToHistory(tab.url, tab.title, 'normal', response)
            .then(() => {
              console.log('普通截图已保存到历史记录');
            })
            .catch(error => {
              console.error('保存历史记录失败:', error);
            });
        } else {
          const errorMsg = response ? response.error : '操作失败';
          updateStatus('❌ 操作失败: ' + errorMsg, 'error');
        }
        captureBtn.disabled = false;
      });
      
      // 自动关闭弹窗
      window.close();
    } catch (error) {
      updateStatus('❌ 操作失败: ' + error.message, 'error');
      captureBtn.disabled = false;
    }
  });

  // 长截图功能
  fullCaptureBtn.addEventListener('click', async function() {
    try {
      isCapturing = true;
      updateStatus('正在智能截取完整页面，请稍候...', 'loading');
      fullCaptureBtn.disabled = true;
      captureBtn.disabled = true;

      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 发送消息给background script进行长截图
      chrome.runtime.sendMessage({
        action: 'captureFullPage',
        url: tab.url,
        title: tab.title
      }, function(response) {
        isCapturing = false;
        
        if (response && response.success) {
          updateStatus('✅ ' + response.filename, 'success');
          console.log('长截图完成，历史记录已由background script保存');
        } else {
          const errorMsg = response ? response.error : '操作失败';
          updateStatus('❌ 长截图失败: ' + errorMsg, 'error');
        }
        fullCaptureBtn.disabled = false;
        captureBtn.disabled = false;
      });
    } catch (error) {
      isCapturing = false;
      updateStatus('❌ 长截图失败: ' + error.message, 'error');
      fullCaptureBtn.disabled = false;
      captureBtn.disabled = false;
    }
  });

  // 区域截图功能
  areaCaptureBtn.addEventListener('click', async function() {
    try {
      updateStatus('请在页面中选择截图区域...', 'loading');
      areaCaptureBtn.disabled = true;
      captureBtn.disabled = true;
      fullCaptureBtn.disabled = true;

      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 发送消息给background script进行区域截图
      chrome.runtime.sendMessage({
        action: 'captureArea',
        url: tab.url,
        title: tab.title
      }, function(response) {
        if (response && response.success) {
          updateStatus('✅ 区域截图已保存！', 'success');
          console.log('区域截图完成，历史记录已由background script保存');
        } else {
          const errorMsg = response ? response.error : '操作失败';
          updateStatus('❌ 区域截图失败: ' + errorMsg, 'error');
        }
        areaCaptureBtn.disabled = false;
        captureBtn.disabled = false;
        fullCaptureBtn.disabled = false;
      });
      
      // 自动关闭弹窗
      window.close();
    } catch (error) {
      updateStatus('❌ 区域截图失败: ' + error.message, 'error');
      areaCaptureBtn.disabled = false;
      captureBtn.disabled = false;
      fullCaptureBtn.disabled = false;
    }
  });

  // 移除停止截图功能，因为不再需要
  // stopCaptureBtn.addEventListener('click', function() {
  //   shouldStop = true;
  //   updateStatus('正在停止截图...', 'loading');
  //   
  //   // 通知background script停止截图
  //   chrome.runtime.sendMessage({
  //     action: 'stopCapture'
  //   });
  // });

  // 历史记录按钮事件
  historyBtn.addEventListener('click', async function() {
    console.log('点击历史记录按钮，打开新页面');
    
    try {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 打开历史记录页面，并传递来源标签页ID
      chrome.tabs.create({
        url: chrome.runtime.getURL(`history.html?sourceTabId=${tab.id}`)
      });
    } catch (error) {
      console.error('获取当前标签页失败:', error);
      // 降级方案：不传递来源信息
      chrome.tabs.create({
        url: chrome.runtime.getURL('history.html')
      });
    }
  });
  
  console.log('WebSnap popup.js 加载完成，所有事件监听器已设置');
});