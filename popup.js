console.log('WebSnap popup.js 开始加载...');

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOMContentLoaded 事件触发');
  
  const captureBtn = document.getElementById('captureBtn');
  const fullCaptureBtn = document.getElementById('fullCaptureBtn');
  const areaCaptureBtn = document.getElementById('areaCaptureBtn');
  const historyBtn = document.getElementById('historyBtn');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const statusDiv = document.getElementById('status');

  console.log('DOM元素获取完成:', {
    captureBtn: !!captureBtn,
    historyBtn: !!historyBtn,
    sidebarToggle: !!sidebarToggle
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
      }, async function(response) {
        if (response && response.success) {
          updateStatus('✅ 截图已保存！', 'success');
          console.log('普通截图完成，历史记录已由background script保存');
          
          // 刷新侧边栏
          await refreshSidebar();
          
          // 延迟关闭弹窗，确保刷新完成
          setTimeout(() => {
            window.close();
          }, 100);
        } else {
          const errorMsg = response ? response.error : '操作失败';
          updateStatus('❌ 操作失败: ' + errorMsg, 'error');
          // 失败时也关闭弹窗
          setTimeout(() => {
            window.close();
          }, 1000);
        }
        captureBtn.disabled = false;
      });
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
      }, async function(response) {
        isCapturing = false;
        
        if (response && response.success) {
          updateStatus('✅ ' + response.filename, 'success');
          console.log('长截图完成，历史记录已由background script保存');
          
          // 刷新侧边栏
          await refreshSidebar();
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
      }, async function(response) {
        if (response && response.success) {
          updateStatus('✅ 区域截图已保存！', 'success');
          console.log('区域截图完成，历史记录已由background script保存');
          
          // 刷新侧边栏
          await refreshSidebar();
          
          // 延迟关闭弹窗，确保刷新完成
          setTimeout(() => {
            window.close();
          }, 100);
        } else {
          const errorMsg = response ? response.error : '操作失败';
          updateStatus('❌ 区域截图失败: ' + errorMsg, 'error');
          // 失败时也关闭弹窗
          setTimeout(() => {
            window.close();
          }, 1000);
        }
        areaCaptureBtn.disabled = false;
        captureBtn.disabled = false;
        fullCaptureBtn.disabled = false;
      });
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

  // 初始化侧边栏状态
  async function initSidebarState() {
    try {
      const result = await chrome.storage.local.get(['sidebar_global_state']);
      const isActive = result.sidebar_global_state || false;
      
      if (isActive) {
        sidebarToggle.classList.add('active');
      }
    } catch (error) {
      console.error('初始化侧边栏状态失败:', error);
    }
  }

  // 确保content script已注入
  async function ensureContentScriptInjected(tabId) {
    try {
      // 尝试发送测试消息
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return true;
    } catch (error) {
      // 如果失败，注入content script
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['content.css']
        });
        // 等待一下让script加载完成
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
      } catch (injectError) {
        console.error('注入content script失败:', injectError);
        return false;
      }
    }
  }

  // 刷新侧边栏
  async function refreshSidebar() {
    try {
      console.log('开始刷新侧边栏...');
      
      // 检查侧边栏是否打开
      const result = await chrome.storage.local.get(['sidebar_global_state']);
      const isActive = result.sidebar_global_state || false;
      console.log('侧边栏状态:', isActive);
      
      if (isActive) {
        // 获取当前活动标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('当前标签页:', tab ? tab.id : 'null');
        
        if (tab && tab.id) {
          // 确保content script已注入
          const scriptReady = await ensureContentScriptInjected(tab.id);
          console.log('Content script准备状态:', scriptReady);
          
          if (scriptReady) {
            // 发送刷新消息给content script
            await chrome.tabs.sendMessage(tab.id, {
              action: 'refreshSidebar'
            });
            console.log('侧边栏刷新消息已发送');
          } else {
            console.log('Content script未准备好，无法刷新侧边栏');
          }
        } else {
          console.log('无法获取当前标签页，无法刷新侧边栏');
        }
      } else {
        console.log('侧边栏未打开，跳过刷新');
      }
    } catch (error) {
      console.error('刷新侧边栏失败:', error);
    }
  }

  // 侧边栏开关按钮事件
  sidebarToggle.addEventListener('click', async function() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const isCurrentlyActive = sidebarToggle.classList.contains('active');
      
      // 确保content script已注入
      const scriptReady = await ensureContentScriptInjected(tab.id);
      if (!scriptReady) {
        updateStatus('无法在此页面使用侧边栏功能', 'error');
        return;
      }
      
      if (isCurrentlyActive) {
        // 关闭侧边栏
        sidebarToggle.classList.remove('active');
        await chrome.storage.local.set({ 'sidebar_global_state': false });
        
        // 发送消息给content script关闭侧边栏
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'hideSidebar'
          });
          updateStatus('侧边栏已关闭', 'success');
        } catch (msgError) {
          console.error('发送关闭消息失败:', msgError);
          updateStatus('关闭侧边栏失败', 'error');
        }
      } else {
        // 打开侧边栏
        sidebarToggle.classList.add('active');
        await chrome.storage.local.set({ 'sidebar_global_state': true });
        
        // 发送消息给content script显示侧边栏
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'showSidebar'
          });
          updateStatus('侧边栏已打开', 'success');
        } catch (msgError) {
          console.error('发送显示消息失败:', msgError);
          updateStatus('打开侧边栏失败', 'error');
          sidebarToggle.classList.remove('active');
          await chrome.storage.local.set({ 'sidebar_global_state': false });
        }
      }
    } catch (error) {
      console.error('切换侧边栏失败:', error);
      updateStatus('操作失败: ' + error.message, 'error');
    }
  });

  // 初始化侧边栏状态
  initSidebarState();
  
  console.log('WebSnap popup.js 加载完成，所有事件监听器已设置');
});