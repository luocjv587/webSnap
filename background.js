// 全局变量用于控制长截图
let shouldStopCapture = false;
// 存储最后一次截图数据用于历史记录
let lastCaptureData = null;

// 监听来自popup的消息
// 监听快捷键命令
chrome.commands.onCommand.addListener(async function(command) {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      console.error('无法获取当前标签页');
      return;
    }
    
    switch (command) {
      case 'capture-normal':
        console.log('执行页面快照快捷键', { url: tab.url, title: tab.title });
        const normalResult = await captureAndSave(tab.url, tab.title);
        console.log('页面快照完成:', normalResult);
        break;
      case 'capture-full':
        console.log('执行长截图快捷键', { url: tab.url, title: tab.title });
        const fullResult = await captureFullPageV2(tab.url, tab.title);
        console.log('长截图完成:', fullResult);
        break;
      case 'capture-area':
        console.log('执行区域截图快捷键', { url: tab.url, title: tab.title });
        const areaResult = await captureAreaScreenshot(tab.url, tab.title);
        console.log('区域截图完成:', areaResult);
        break;
      case 'open-history':
        console.log('执行打开历史记录快捷键');
        chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
        break;
      default:
        console.log('未知命令:', command);
    }
  } catch (error) {
    console.error('快捷键执行失败:', error);
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'captureAndSave') {
    captureAndSave(request.url, request.title)
      .then(result => {
        sendResponse({ success: true, filename: result.filename });
      })
      .catch(error => {
        console.error('截图失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  // 处理 Notion API 请求
  if (request.action === 'notionApiRequest') {
    handleNotionApiRequest(request)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('Notion API 请求失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  // 处理图片上传到 Notion
  if (request.action === 'uploadImageToNotion') {
    uploadImageToNotion(request.base64Data, request.notionToken)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('图片上传失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'uploadFileToNotion') {
    uploadFileToNotion(request.filePath, request.notionToken)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('文件上传失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'captureFullPage') {
    shouldStopCapture = false; // 重置停止标志
    captureFullPageV2(request.url, request.title)
      .then(result => {
        sendResponse({ success: true, filename: result.filename });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'captureArea') {
    captureAreaScreenshot(request.url, request.title)
      .then(result => {
        sendResponse({ 
          success: true, 
          filename: result.filename,
          downloadId: result.downloadId,
          fullPath: result.fullPath
        });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'stopCapture') {
    shouldStopCapture = true;
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getLastCaptureData') {
    sendResponse({ imageData: lastCaptureData });
    return true;
  }
  
  if (request.action === 'readFile') {
    readFileContent(request.filePath)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('读取文件失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'getImageData') {
    getImageDataFromStorage(request.filename)
      .then(result => {
        sendResponse({ success: true, imageData: result });
      })
      .catch(error => {
        console.error('获取图片数据失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'getWebSnapFolderContent') {
    getWebSnapFolderContent()
      .then(result => {
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        console.error('获取webSnap文件夹内容失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'getFileContent') {
    getFileContent(request.fileUrl)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('获取文件内容失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
});

// 截图并保存
async function captureAndSave(url, title) {
  try {
    // 1. 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 2. 截图
    const imageData = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(tab.windowId, {format: 'png'}, function(dataUrl) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      });
    });
    
    // 3. 生成文件名
    const filename = generateFilename(title);
    
    // 4. 下载图片
    const downloadResult = await downloadImage(imageData, filename);
    
    // 5. 保存截图数据供历史记录使用
    lastCaptureData = imageData;

    // 5.1 生成缩略图
    const thumbnailData = await generateThumbnail(imageData);
    
    // 6. 直接保存到历史记录
    await saveToHistoryInBackground(url, title, 'normal', {
      filename: filename,
      downloadId: downloadResult.downloadId,
      fullPath: downloadResult.fullPath,
      thumbnail: thumbnailData
    });
    
    return { 
      filename: filename,
      downloadId: downloadResult.downloadId,
      fullPath: downloadResult.fullPath
    };
  } catch (error) {
    throw new Error('截图保存失败: ' + error.message);
  }
}

// 新版长截图功能 - 优化算法
async function captureFullPageV2(url, title) {
  try {
    // 1. 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    console.log('开始新版长截图流程...');
    
    // 2. 预处理：获取页面信息并预加载内容
    const pageInfo = await preparePageForCapture(tab.id);
    console.log('页面信息:', pageInfo);
    
    // 3. 检查是否需要长截图
    if (pageInfo.pageHeight <= pageInfo.viewportHeight * 1.2 && !pageInfo.hasScrollableContent) {
      // 页面很短且没有可滚动内容，直接截图
      const result = await captureSimplePage(tab, title);
      
      // 读取原图以生成缩略图
      const imageData = lastCaptureData;
      const thumbnailData = imageData ? await generateThumbnail(imageData) : null;
      
      // 保存到历史记录
      await saveToHistoryInBackground(url, title, 'full', { ...result, thumbnail: thumbnailData });
      
      return result;
    }
    
    // 4. 长页面处理：使用智能分段截图
    const screenshots = await capturePageInSegments(tab.id, pageInfo);
    
    if (screenshots.length === 0) {
      throw new Error('未能获取任何截图');
    }
    
    // 5. 拼接图片
    const finalImage = await stitchImages(tab.id, screenshots, pageInfo, pageInfo.hasScrollableContent);
    
    // 生成缩略图
    const thumbnailData = await generateThumbnail(finalImage);
    
    // 6. 保存和下载
    const filename = generateFilename(title + '_长截图');
    const downloadResult = await downloadImage(finalImage, filename);
    
    // 7. 保存截图数据
    lastCaptureData = finalImage;
    
    // 8. 直接保存到历史记录
    await saveToHistoryInBackground(url, title, 'full', {
      filename: filename,
      downloadId: downloadResult.downloadId,
      fullPath: downloadResult.fullPath,
      thumbnail: thumbnailData
    });
    
    // 9. 恢复页面状态
    await restorePageState(tab.id, pageInfo);
    
    // 10. 刷新页面
    await chrome.tabs.reload(tab.id);
    
    // 11. 通知完成
    try {
      chrome.runtime.sendMessage({
        action: 'captureComplete',
        stopped: shouldStopCapture,
        segments: screenshots.length
      });
    } catch (e) {
      // 忽略通知错误
    }
    
    return { 
      filename: filename,
      downloadId: downloadResult.downloadId,
      fullPath: downloadResult.fullPath
    };
    
  } catch (error) {
    console.error('长截图失败:', error);
    throw new Error('长截图失败: ' + error.message);
  }
}

// 预处理页面：获取信息并预加载内容
async function preparePageForCapture(tabId) {
  // 获取页面基本信息
  const pageInfo = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // 保存原始滚动位置
      const originalScroll = {
        x: window.scrollX,
        y: window.scrollY
      };
      
      // 滚动到顶部
      window.scrollTo(0, 0);
      
      // 获取页面真实尺寸
      const body = document.body;
      const html = document.documentElement;
      
      // 基本页面高度
      let pageHeight = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
      );
      
      // 检测页面中的可滚动元素
      const scrollableElements = [];
      const allElements = document.querySelectorAll('*');
      
      // 查找可滚动元素
      for (const el of allElements) {
        // 跳过小元素和隐藏元素
        if (el.offsetWidth < 50 || el.offsetHeight < 50 || 
            getComputedStyle(el).display === 'none' || 
            getComputedStyle(el).visibility === 'hidden') {
          continue;
        }
        
        const style = getComputedStyle(el);
        const isScrollable = (
          style.overflow === 'auto' || 
          style.overflow === 'scroll' ||
          style.overflowY === 'auto' || 
          style.overflowY === 'scroll'
        );
        
        if (isScrollable && el.scrollHeight > el.clientHeight) {
          scrollableElements.push({
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            ratio: el.scrollHeight / el.clientHeight
          });
        }
      }
      
      // 如果找到可滚动元素，考虑其高度
      if (scrollableElements.length > 0) {
        // 按滚动比例排序，找出最可能是主内容区的元素
        scrollableElements.sort((a, b) => b.ratio - a.ratio);
        
        // 如果最大可滚动元素的高度明显大于当前检测到的页面高度，使用它
        const maxScrollableHeight = scrollableElements[0].scrollHeight;
        if (maxScrollableHeight > pageHeight * 1.2) {
          pageHeight = maxScrollableHeight;
          console.log('使用可滚动元素高度:', maxScrollableHeight);
        }
      }
      
      const pageWidth = Math.max(
        body.scrollWidth,
        body.offsetWidth,
        html.clientWidth,
        html.scrollWidth,
        html.offsetWidth,
        window.innerWidth
      );
      
      // 隐藏可能遮挡截图的固定元素
      const fixedElements = [];
      const allFixedElements = document.querySelectorAll('*');
      
      // 找到主要的可滚动容器（如果存在）
      let mainScrollableContainer = null;
      if (scrollableElements.length > 0) {
        // 找到最可能是主内容区的可滚动元素
        const sortedScrollable = [...scrollableElements].sort((a, b) => b.ratio - a.ratio);
        const allElements = document.querySelectorAll('*');
        
        for (const el of allElements) {
          const style = getComputedStyle(el);
          const isScrollable = (
            style.overflow === 'auto' || 
            style.overflow === 'scroll' ||
            style.overflowY === 'auto' || 
            style.overflowY === 'scroll'
          );
          
          if (isScrollable && el.scrollHeight > el.clientHeight) {
            const ratio = el.scrollHeight / el.clientHeight;
            if (Math.abs(ratio - sortedScrollable[0].ratio) < 0.1) {
              mainScrollableContainer = el;
              break;
            }
          }
        }
      }
      
      for (const el of allFixedElements) {
        const style = getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          const rect = el.getBoundingClientRect();
          let shouldHide = false;
          
          // 如果有主要滚动容器，重点检查是否遮挡滚动区域
          if (mainScrollableContainer) {
            const containerRect = mainScrollableContainer.getBoundingClientRect();
            
            // 检查是否在滚动容器的上方或下方固定区域
            const isAboveContainer = rect.bottom <= containerRect.top + 10; // 容器上方10px内
            const isBelowContainer = rect.top >= containerRect.bottom - 10; // 容器下方10px内
            const isOverlappingContainer = (
              rect.top < containerRect.bottom && 
              rect.bottom > containerRect.top
            ); // 与容器重叠
            
            // 隐藏可能遮挡滚动内容的固定元素
            if ((isAboveContainer || isBelowContainer || isOverlappingContainer) && 
                rect.width > 100 && rect.height > 20) {
              shouldHide = true;
              console.log('隐藏滚动容器相关固定元素:', el.tagName, el.className, 
                         isAboveContainer ? '(上方)' : isBelowContainer ? '(下方)' : '(重叠)');
            }
          } else {
            // 没有滚动容器时，使用原有逻辑
            const isBottomFixed = rect.bottom >= window.innerHeight * 0.8; // 底部80%区域
            const isTopFixed = rect.top <= window.innerHeight * 0.2; // 顶部20%区域
            
            if (isBottomFixed || (rect.height > 50 && (isTopFixed || isBottomFixed))) {
              shouldHide = true;
              console.log('隐藏传统固定元素:', el.tagName, el.className);
            }
          }
          
          // 额外检查：隐藏可能的导航栏、工具栏等
          const isLikelyNavigation = (
            rect.width >= window.innerWidth * 0.8 && // 宽度占屏幕80%以上
            rect.height <= 120 && // 高度不超过120px
            (rect.top <= 10 || rect.bottom >= window.innerHeight - 10) // 贴近顶部或底部
          );
          
          if (isLikelyNavigation) {
            shouldHide = true;
            console.log('隐藏导航栏类固定元素:', el.tagName, el.className);
          }
          
          // 保存原始样式并隐藏
          if (shouldHide) {
            fixedElements.push({
              element: el,
              originalDisplay: style.display,
              originalVisibility: style.visibility
            });
            el.style.display = 'none';
          }
        }
      }
      
      return {
        pageHeight,
        pageWidth,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        originalScroll,
        devicePixelRatio: window.devicePixelRatio || 1,
        hasScrollableContent: scrollableElements.length > 0,
        fixedElements: fixedElements.map(item => ({
          selector: item.element.tagName + (item.element.className ? '.' + item.element.className.split(' ').join('.') : ''),
          originalDisplay: item.originalDisplay,
          originalVisibility: item.originalVisibility
        }))
      };
    }
  });
  
  const info = pageInfo[0].result;
  
  // 预滚动以触发懒加载
  await preloadContent(tabId, info);
  
  return info;
}

// 预加载内容：智能滚动触发懒加载
async function preloadContent(tabId, pageInfo) {
  console.log('开始预加载内容...');
  
  // 限制最大高度以防止过长页面导致的性能问题
  const maxProcessHeight = Math.min(pageInfo.pageHeight, 20000);
  
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async (pageHeight, viewportHeight, hasScrollableContent) => {
      // 智能预滚动策略
      const scrollPoints = [];
      const stepSize = viewportHeight * 0.75; // 75%步长，确保覆盖但避免过多重叠
      
      for (let y = 0; y < pageHeight; y += stepSize) {
        scrollPoints.push(Math.min(y, pageHeight - viewportHeight));
      }
      
      // 限制滚动点数量，避免太多次滚动
      const maxScrollPoints = Math.min(scrollPoints.length, 15);
      
      // 查找可滚动元素
      let scrollableElement = null;
      if (hasScrollableContent) {
        const allElements = document.querySelectorAll('*');
        const scrollableElements = [];
        
        for (const el of allElements) {
          // 跳过小元素和隐藏元素
          if (el.offsetWidth < 50 || el.offsetHeight < 50 || 
              getComputedStyle(el).display === 'none' || 
              getComputedStyle(el).visibility === 'hidden') {
            continue;
          }
          
          const style = getComputedStyle(el);
          const isScrollable = (
            style.overflow === 'auto' || 
            style.overflow === 'scroll' ||
            style.overflowY === 'auto' || 
            style.overflowY === 'scroll'
          );
          
          if (isScrollable && el.scrollHeight > el.clientHeight) {
            scrollableElements.push({
              element: el,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              ratio: el.scrollHeight / el.clientHeight
            });
          }
        }
        
        if (scrollableElements.length > 0) {
          // 按滚动比例排序，找出最可能是主内容区的元素
          scrollableElements.sort((a, b) => b.ratio - a.ratio);
          scrollableElement = scrollableElements[0].element;
          console.log('找到主要可滚动元素，高度比例:', scrollableElements[0].ratio);
        }
      }
      
      // 快速滚动到各个位置触发懒加载
      for (let i = 0; i < maxScrollPoints; i++) {
        const scrollY = scrollPoints[i];
        
        if (scrollableElement) {
          // 滚动自定义容器
          scrollableElement.scrollTop = scrollY;
        } else {
          // 滚动整个页面
          window.scrollTo(0, scrollY);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200)); // 增加等待时间确保内容加载
      }
      
      // 滚动到底部确保所有内容加载
      if (scrollableElement) {
        scrollableElement.scrollTop = scrollableElement.scrollHeight;
      } else {
        window.scrollTo(0, pageHeight);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 回到顶部
      if (scrollableElement) {
        scrollableElement.scrollTop = 0;
      } else {
        window.scrollTo(0, 0);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    },
    args: [maxProcessHeight, pageInfo.viewportHeight, pageInfo.hasScrollableContent]
  });
}

// 简单页面截图（无需分段）
async function captureSimplePage(tab, title) {
  const imageData = await new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(tab.windowId, {format: 'png'}, function(dataUrl) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(dataUrl);
      }
    });
  });
  
  const filename = generateFilename(title + '_长截图');
  const downloadResult = await downloadImage(imageData, filename);
  
  lastCaptureData = imageData;
  
  return {
    filename: filename,
    downloadId: downloadResult.downloadId,
    fullPath: downloadResult.fullPath
  };
}

// 分段截图
async function capturePageInSegments(tabId, pageInfo) {
  const screenshots = [];
  const { pageHeight, viewportHeight, hasScrollableContent } = pageInfo;
  
  // 限制最大处理高度和分段数
  let maxHeight = Math.min(pageHeight, 25000); // 最大25000px
  const segmentHeight = viewportHeight;
  let totalSegments = Math.min(Math.ceil(maxHeight / segmentHeight), 50); // 最多50段
  
  console.log(`将页面分为 ${totalSegments} 段进行截图 (实际高度: ${maxHeight}px)`);
  
  // 如果有可滚动内容，先找到主要的可滚动元素
  let scrollableElementInfo = null;
  if (hasScrollableContent) {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const allElements = document.querySelectorAll('*');
        const scrollableElements = [];
        
        for (const el of allElements) {
          // 跳过小元素和隐藏元素
          if (el.offsetWidth < 50 || el.offsetHeight < 50 || 
              getComputedStyle(el).display === 'none' || 
              getComputedStyle(el).visibility === 'hidden') {
            continue;
          }
          
          const style = getComputedStyle(el);
          const isScrollable = (
            style.overflow === 'auto' || 
            style.overflow === 'scroll' ||
            style.overflowY === 'auto' || 
            style.overflowY === 'scroll'
          );
          
          if (isScrollable && el.scrollHeight > el.clientHeight) {
            // 记录元素的路径，以便后续找到它
            let path = '';
            let node = el;
            while (node && node !== document.body) {
              let name = node.nodeName.toLowerCase();
              if (node.id) {
                name += '#' + node.id;
              } else if (node.className) {
                name += '.' + Array.from(node.classList).join('.');
              }
              path = name + (path ? ' > ' + path : '');
              node = node.parentNode;
            }
            
            scrollableElements.push({
              path: path,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              ratio: el.scrollHeight / el.clientHeight
            });
          }
        }
        
        if (scrollableElements.length > 0) {
          // 按滚动比例排序，找出最可能是主内容区的元素
          scrollableElements.sort((a, b) => b.ratio - a.ratio);
          return scrollableElements[0];
        }
        
        return null;
      }
    });
    
    if (result && result[0] && result[0].result) {
      scrollableElementInfo = result[0].result;
      console.log('找到主要可滚动元素，高度比例:', scrollableElementInfo.ratio);
      
      // 重新计算基于可滚动元素的高度和段数
      const scrollableHeight = scrollableElementInfo.scrollHeight;
      const clientHeight = scrollableElementInfo.clientHeight;
      
      // 使用可滚动元素的实际高度来计算段数
      // 每次滚动clientHeight * 0.9，需要覆盖scrollableHeight - clientHeight的距离
      const maxScrollDistance = scrollableHeight - clientHeight;
      const scrollStep = clientHeight * 0.9;
      totalSegments = Math.min(Math.ceil(maxScrollDistance / scrollStep) + 1, 50);
      
      console.log(`重新计算段数: ${totalSegments} (可滚动高度: ${scrollableHeight}, 客户端高度: ${clientHeight}, 最大滚动距离: ${maxScrollDistance})`);
    }
  }
  
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 3;
  const maxRetryPerSegment = 2; // 每段最多重试2次
  
  for (let i = 0; i < totalSegments && !shouldStopCapture; i++) {
    let scrollY;
    if (i === totalSegments - 1) {
      // 最后一段：滚动到底部
      scrollY = maxHeight - viewportHeight;
    } else {
      // 普通段：按步长滚动
      scrollY = i * segmentHeight;
    }
    
    console.log(`准备截取第${i + 1}段，滚动位置: ${scrollY}`);
    
    // 发送进度通知
    try {
      chrome.runtime.sendMessage({
        action: 'updateProgress',
        current: i + 1,
        total: totalSegments
      });
    } catch (e) {
      // 忽略通知错误
    }
    
    let segmentCaptured = false;
    let retryCount = 0;
    
    // 重试机制：确保每一段都尽力截取
    while (!segmentCaptured && retryCount <= maxRetryPerSegment && !shouldStopCapture) {
      try {
        // 滚动到指定位置
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (y, hasScrollableContent, scrollableElementPath, segmentIndex, totalSegments) => {
            // 如果有可滚动元素且提供了元素路径，尝试直接定位该元素
            if (hasScrollableContent && scrollableElementPath) {
              // 尝试通过路径查找元素
              const findElementByPath = (path) => {
                // 简单的路径解析，支持基本的CSS选择器
                try {
                  // 先尝试直接作为选择器使用
                  const elements = document.querySelectorAll(path);
                  if (elements.length > 0) return elements[0];
                  
                  // 如果失败，尝试分解路径
                  const parts = path.split(' > ');
                  let currentElements = [document.body];
                  
                  for (const part of parts) {
                    const nextElements = [];
                    for (const el of currentElements) {
                      const children = el.querySelectorAll(part);
                      for (const child of children) {
                        nextElements.push(child);
                      }
                    }
                    if (nextElements.length === 0) return null;
                    currentElements = nextElements;
                  }
                  
                  return currentElements[0];
                } catch (e) {
                  console.error('查找元素路径失败:', e);
                  return null;
                }
              };
              
              // 尝试找到之前识别的可滚动元素
              const scrollableElement = findElementByPath(scrollableElementPath);
              
              if (scrollableElement) {
                // 计算在可滚动元素中对应的位置
                // 使用90%重叠策略，每次滚动视口高度的90%
                const maxScrollTop = scrollableElement.scrollHeight - scrollableElement.clientHeight;
                const viewportHeight = scrollableElement.clientHeight;
                const scrollStep = viewportHeight * 0.9; // 90%重叠策略
                const targetScrollTop = Math.min(segmentIndex * scrollStep, maxScrollTop);
                
                // 确保不超过最大滚动位置
                const finalScrollTop = Math.min(targetScrollTop, maxScrollTop);
                
                // 滚动自定义容器
                scrollableElement.scrollTop = finalScrollTop;
                console.log('滚动自定义容器到位置:', finalScrollTop, '(段索引:', segmentIndex, ', 步长:', Math.round(scrollStep), ', 最大滚动:', maxScrollTop, ')');
                
                // 恢复临时隐藏的固定元素（这里需要重新查找，因为在不同的作用域）
                const allFixedElements = document.querySelectorAll('*');
                for (const fixedEl of allFixedElements) {
                  const fixedStyle = getComputedStyle(fixedEl);
                  if ((fixedStyle.position === 'fixed' || fixedStyle.position === 'sticky') && 
                      fixedStyle.display === 'none' && 
                      fixedEl.dataset && fixedEl.dataset.tempHidden === 'true') {
                    // 恢复之前临时隐藏的元素
                    fixedEl.style.display = fixedEl.dataset.originalDisplay || '';
                    fixedEl.style.visibility = fixedEl.dataset.originalVisibility || '';
                    delete fixedEl.dataset.tempHidden;
                    delete fixedEl.dataset.originalDisplay;
                    delete fixedEl.dataset.originalVisibility;
                  }
                }
                
                return; // 已处理滚动，退出
              } else {
                console.warn('无法找到之前识别的可滚动元素，回退到查找新元素');
              }
            }
            
            // 在滚动前，临时隐藏可能遮挡滚动内容的固定元素
            const tempHiddenElements = [];
            const allFixedElements = document.querySelectorAll('*');
            
            for (const fixedEl of allFixedElements) {
              const fixedStyle = getComputedStyle(fixedEl);
              if (fixedStyle.position === 'fixed' || fixedStyle.position === 'sticky') {
                const fixedRect = fixedEl.getBoundingClientRect();
                
                // 检查是否可能遮挡滚动内容
                 if (fixedRect.width > 100 && fixedRect.height > 20 && 
                     fixedStyle.display !== 'none' && fixedStyle.visibility !== 'hidden') {
                   // 使用dataset标记临时隐藏的元素，便于后续恢复
                   fixedEl.dataset.tempHidden = 'true';
                   fixedEl.dataset.originalDisplay = fixedStyle.display;
                   fixedEl.dataset.originalVisibility = fixedStyle.visibility;
                   
                   tempHiddenElements.push({
                     element: fixedEl,
                     originalDisplay: fixedStyle.display,
                     originalVisibility: fixedStyle.visibility
                   });
                   fixedEl.style.display = 'none';
                 }
              }
            }
            
            // 如果没有提供元素路径或找不到元素，尝试重新查找
            if (hasScrollableContent) {
              const allElements = document.querySelectorAll('*');
              const scrollableElements = [];
              
              for (const el of allElements) {
                // 跳过小元素和隐藏元素
                if (el.offsetWidth < 50 || el.offsetHeight < 50 || 
                    getComputedStyle(el).display === 'none' || 
                    getComputedStyle(el).visibility === 'hidden') {
                  continue;
                }
                
                const style = getComputedStyle(el);
                const isScrollable = (
                  style.overflow === 'auto' || 
                  style.overflow === 'scroll' ||
                  style.overflowY === 'auto' || 
                  style.overflowY === 'scroll'
                );
                
                if (isScrollable && el.scrollHeight > el.clientHeight) {
                  scrollableElements.push({
                    element: el,
                    scrollHeight: el.scrollHeight,
                    clientHeight: el.clientHeight,
                    ratio: el.scrollHeight / el.clientHeight
                  });
                }
              }
              
              if (scrollableElements.length > 0) {
                // 按滚动比例排序，找出最可能是主内容区的元素
                scrollableElements.sort((a, b) => b.ratio - a.ratio);
                const scrollableElement = scrollableElements[0].element;
                
                // 计算在可滚动元素中对应的位置
                // 使用90%重叠策略，每次滚动视口高度的90%
                const maxScrollTop = scrollableElement.scrollHeight - scrollableElement.clientHeight;
                const viewportHeight = scrollableElement.clientHeight;
                const scrollStep = viewportHeight * 0.9; // 90%重叠策略
                const targetScrollTop = Math.min(segmentIndex * scrollStep, maxScrollTop);
                
                // 确保不超过最大滚动位置
                const finalScrollTop = targetScrollTop;
                
                // 滚动自定义容器
                scrollableElement.scrollTop = finalScrollTop;
                console.log('滚动新找到的自定义容器到位置:', finalScrollTop, '(段索引:', segmentIndex, ', 步长:', Math.round(scrollStep), ', 最大滚动:', maxScrollTop, ')');
                
                // 恢复临时隐藏的固定元素
             if (tempHiddenElements && tempHiddenElements.length > 0) {
               tempHiddenElements.forEach(item => {
                 if (item.element && item.element.style) {
                   item.element.style.display = item.originalDisplay;
                   item.element.style.visibility = item.originalVisibility;
                   // 清理dataset标记
                   if (item.element.dataset) {
                     delete item.element.dataset.tempHidden;
                     delete item.element.dataset.originalDisplay;
                     delete item.element.dataset.originalVisibility;
                   }
                 }
               });
             }
             
             // 额外检查：恢复任何可能遗漏的临时隐藏元素
             for (const fixedEl of allFixedElements) {
               if (fixedEl.dataset && fixedEl.dataset.tempHidden === 'true') {
                 fixedEl.style.display = fixedEl.dataset.originalDisplay || '';
                 fixedEl.style.visibility = fixedEl.dataset.originalVisibility || '';
                 delete fixedEl.dataset.tempHidden;
                 delete fixedEl.dataset.originalDisplay;
                 delete fixedEl.dataset.originalVisibility;
               }
             }
                
                return; // 已处理滚动，退出
              }
            }
            
            // 默认滚动整个页面
            window.scrollTo(0, y);
            
            // 恢复临时隐藏的固定元素
             if (tempHiddenElements && tempHiddenElements.length > 0) {
               tempHiddenElements.forEach(item => {
                 if (item.element && item.element.style) {
                   item.element.style.display = item.originalDisplay;
                   item.element.style.visibility = item.originalVisibility;
                   // 清理dataset标记
                   if (item.element.dataset) {
                     delete item.element.dataset.tempHidden;
                     delete item.element.dataset.originalDisplay;
                     delete item.element.dataset.originalVisibility;
                   }
                 }
               });
             }
             
             // 额外检查：恢复任何可能遗漏的临时隐藏元素
             for (const fixedEl of allFixedElements) {
               if (fixedEl.dataset && fixedEl.dataset.tempHidden === 'true') {
                 fixedEl.style.display = fixedEl.dataset.originalDisplay || '';
                 fixedEl.style.visibility = fixedEl.dataset.originalVisibility || '';
                 delete fixedEl.dataset.tempHidden;
                 delete fixedEl.dataset.originalDisplay;
                 delete fixedEl.dataset.originalVisibility;
               }
             }
          },
          args: [scrollY, pageInfo.hasScrollableContent, scrollableElementInfo ? scrollableElementInfo.path : null, i, totalSegments]
        });
        
        // 动态等待时间：第一段和重试时等待更久，对于可滚动内容需要更长的等待时间
        let waitTime = (i === 0 || retryCount > 0) ? 800 : 400;
        // 如果是可滚动内容，增加等待时间以确保内容完全加载和渲染
        if (pageInfo.hasScrollableContent) {
          waitTime += 200; // 额外增加200ms等待时间
        }
        console.log(`等待内容加载和渲染: ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        if (shouldStopCapture) break;
        
        // 截图
        const segmentData = await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('截图超时'));
          }, 10000); // 10秒超时
          
          chrome.tabs.captureVisibleTab(null, {format: 'png'}, function(dataUrl) {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(dataUrl);
            }
          });
        });
        
        // 成功截图，保存数据
        const scrollStep = pageInfo.hasScrollableContent ? 
          (pageInfo.scrollableElementHeight ? 
            (pageInfo.scrollableElementHeight - pageInfo.viewportHeight) / (totalSegments - 1) : 
            pageInfo.viewportHeight * 0.75) : 
          pageInfo.viewportHeight;
        
        screenshots.push({
          data: segmentData,
          segmentIndex: i,  // 使用原始段索引
          scrollY: scrollY,
          isLast: i === totalSegments - 1,
          retryCount: retryCount,
          scrollStep: scrollStep  // 添加滚动步长信息
        });
        
        console.log(`第${i + 1}段截图成功 (重试${retryCount}次)`);
        segmentCaptured = true;
        consecutiveFailures = 0; // 重置连续失败计数
        
      } catch (error) {
        retryCount++;
        console.error(`第${i + 1}段截图失败 (第${retryCount}次尝试):`, error);
        
        if (retryCount > maxRetryPerSegment) {
          console.error(`第${i + 1}段截图彻底失败，跳过此段`);
          consecutiveFailures++;
          
          // 如果连续失败太多段，停止整个截图过程
          if (consecutiveFailures >= maxConsecutiveFailures) {
            console.error('连续失败段数过多，停止截图');
            break;
          }
        } else {
          // 重试前短暂等待
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // API限制延迟 - 动态调整
    if (i < totalSegments - 1 && !shouldStopCapture) {
      const delayTime = screenshots.length > 10 ? 250 : 200; // 截图多时增加延迟
      await new Promise(resolve => setTimeout(resolve, delayTime));
    }
  }
  
  if (screenshots.length === 0) {
    throw new Error('未能获取任何有效截图');
  }
  
  console.log(`分段截图完成：成功获取 ${screenshots.length}/${totalSegments} 段`);
  
  // 检查是否有缺失的段
  const capturedSegments = screenshots.map(s => s.segmentIndex).sort((a, b) => a - b);
  const missingSegments = [];
  for (let i = 0; i < totalSegments; i++) {
    if (!capturedSegments.includes(i)) {
      missingSegments.push(i + 1);
    }
  }
  
  if (missingSegments.length > 0) {
    console.warn(`警告：缺失段数: ${missingSegments.join(', ')}`);
  }
  
  return screenshots;
}

// 拼接图片 - 优化内存使用
async function stitchImages(tabId, screenshots, pageInfo, hasScrollableContent = false) {
  if (screenshots.length === 1) {
    return screenshots[0].data;
  }
  
  console.log(`开始拼接 ${screenshots.length} 张截图...`);
  
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (screenshots, pageHeight, viewportHeight, devicePixelRatio, hasScrollableContent) => {
      return new Promise((resolve, reject) => {
        if (screenshots.length === 0) {
          reject(new Error('没有截图可拼接'));
          return;
        }
        
        // 设置超时
        const timeout = setTimeout(() => {
          reject(new Error('拼接超时'));
        }, 30000); // 30秒超时
        
        // 创建第一个图片以获取尺寸信息
        const firstImg = new Image();
        firstImg.onload = function() {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 设置canvas尺寸 - 限制最大尺寸
            const canvasWidth = firstImg.width;
            const maxCanvasHeight = 32767; // Canvas最大高度限制
            
            let idealHeight;
            if (hasScrollableContent) {
              // 对于自定义滚动容器，使用连续绘制策略计算高度
              // 第一段完整高度 + 其余段90%高度
              const segmentHeight = firstImg.height * 0.9;
              idealHeight = firstImg.height + (screenshots.length - 1) * segmentHeight;
            } else {
              // 对于普通页面，使用原有计算方式
              idealHeight = Math.min(
                pageHeight * devicePixelRatio, 
                firstImg.height * screenshots.length,
                maxCanvasHeight
              );
            }
            
            // 确保不超过最大限制
            idealHeight = Math.min(idealHeight, maxCanvasHeight);
            
            canvas.width = canvasWidth;
            canvas.height = idealHeight;
            
            console.log(`Canvas尺寸: ${canvasWidth} x ${idealHeight}`);
            
            // 白色背景
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvasWidth, idealHeight);
            
            let loadedCount = 0;
            const totalImages = screenshots.length;
            let hasError = false;
            
            // 按段索引排序，确保正确的拼接顺序
            const sortedScreenshots = screenshots.sort((a, b) => a.segmentIndex - b.segmentIndex);
            
            // 加载并绘制所有图片
            sortedScreenshots.forEach((screenshot, arrayIndex) => {
              const img = new Image();
              
              img.onload = function() {
                try {
                  // 使用原始段索引计算绘制位置，确保位置正确
                  let drawY;
                  if (screenshot.isLast) {
                    // 最后一段：贴底绘制
                    drawY = idealHeight - img.height;
                  } else {
                    // 普通段：连续绘制
                    if (hasScrollableContent) {
                      // 对于自定义滚动容器，使用连续绘制策略
                      // 每段图片高度减去重叠部分（约10%重叠以确保连续性）
                      const segmentHeight = img.height * 0.9;
                      drawY = screenshot.segmentIndex * segmentHeight;
                    } else {
                      // 对于普通页面，使用视口高度
                      drawY = screenshot.segmentIndex * viewportHeight * devicePixelRatio;
                    }
                  }
                  
                  // 检查是否超出canvas范围
                  if (drawY >= idealHeight) {
                    console.warn(`段${screenshot.segmentIndex}超出canvas范围，跳过`);
                    loadedCount++;
                    checkComplete();
                    return;
                  }
                  
                  // 最后一段或超出范围时的裁剪
                  let drawHeight = img.height;
                  const remainingHeight = idealHeight - drawY;
                  if (drawHeight > remainingHeight) {
                    drawHeight = remainingHeight;
                  }
                  
                  // 绘制图片
                  if (drawHeight > 0) {
                    ctx.drawImage(img, 0, 0, img.width, drawHeight, 0, drawY, canvasWidth, drawHeight);
                    console.log(`已绘制段${screenshot.segmentIndex}: drawY=${drawY}, drawHeight=${drawHeight}, 重试${screenshot.retryCount}次`);
                    
                    // 在非最后一段的底部添加分割线
                    if (!screenshot.isLast && arrayIndex < sortedScreenshots.length - 1) {
                      const separatorY = drawY + drawHeight - 1; // 在当前段底部绘制分割线
                      if (separatorY < idealHeight - 2) { // 确保有足够空间绘制分割线
                        // 绘制分割线
                        ctx.strokeStyle = '#e0e0e0'; // 浅灰色分割线
                        ctx.lineWidth = 2;
                        ctx.setLineDash([10, 5]); // 虚线样式
                        ctx.beginPath();
                        ctx.moveTo(20, separatorY);
                        ctx.lineTo(canvasWidth - 20, separatorY);
                        ctx.stroke();
                        ctx.setLineDash([]); // 重置线条样式
                        
                        console.log(`已添加分割线在段${screenshot.segmentIndex}底部: Y=${separatorY}`);
                      }
                    }
                  }
                  
                } catch (error) {
                  console.error(`绘制段${screenshot.segmentIndex}失败:`, error);
                  hasError = true;
                }
                
                loadedCount++;
                checkComplete();
              };
              
              img.onerror = function() {
                console.error(`段${screenshot.segmentIndex}图片加载失败`);
                hasError = true;
                loadedCount++;
                checkComplete();
              };
              
              // 设置图片源
              img.src = screenshot.data;
            });
            
            function checkComplete() {
              if (loadedCount === totalImages) {
                clearTimeout(timeout);
                if (hasError && loadedCount < totalImages * 0.5) {
                  // 如果超过一半的图片失败，认为拼接失败
                  reject(new Error('太多图片加载失败'));
                } else {
                  try {
                    const result = canvas.toDataURL('image/png', 0.9); // 轻微压缩
                    resolve(result);
                  } catch (error) {
                    reject(new Error('生成最终图片失败: ' + error.message));
                  }
                }
              }
            }
            
          } catch (error) {
            clearTimeout(timeout);
            reject(new Error('Canvas创建失败: ' + error.message));
          }
        };
        
        firstImg.onerror = function() {
          clearTimeout(timeout);
          reject(new Error('第一张图片加载失败'));
        };
        
        firstImg.src = screenshots[0].data;
      });
    },
    args: [screenshots, pageInfo.pageHeight, pageInfo.viewportHeight, pageInfo.devicePixelRatio, hasScrollableContent]
  });
  
  return result[0].result;
}

// 恢复页面状态
async function restorePageState(tabId, pageInfo) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scroll) => {
      // 恢复滚动位置
      window.scrollTo(scroll.x, scroll.y);
      
      // 不再恢复固定元素，让页面保持刷新后的状态
      console.log('页面已恢复滚动位置，固定元素保持隐藏状态');
    },
    args: [pageInfo.originalScroll]
  });
}

// OCR和文本处理功能已移除，现在使用更简单的文件命名策略

// 生成文件名
function generateFilename(pageTitle) {
  const now = new Date();
  const timestamp = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') + 
    String(now.getMinutes()).padStart(2, '0') + 
    String(now.getSeconds()).padStart(2, '0');
  
  // 清理文件名中的非法字符
  const safeText = (pageTitle || '网页截图')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 30); // 限制长度
  
  return `${safeText}_${timestamp}.png`;
}

// 下载图片
async function downloadImage(imageData, filename) {
  try {
    // 修改文件名，添加 webSnap 文件夹路径
    const webSnapFilename = `webSnap/${filename}`;
    
    // 直接使用base64数据URL进行下载
    const downloadId = await chrome.downloads.download({
      url: imageData,
      filename: webSnapFilename,
      saveAs: false // 直接保存到默认下载目录下的 webSnap 文件夹
    });
    
    console.log('下载已开始，downloadId:', downloadId, '保存到:', webSnapFilename);
    
    // 立即返回downloadId，不等待下载完成
    return {
      downloadId: downloadId,
      filename: filename,
      fullPath: webSnapFilename // 更新为包含文件夹路径的完整路径
    };
  } catch (error) {
    throw new Error('下载失败: ' + error.message);
  }
}

// 生成缩略图
async function generateThumbnail(imageData, maxWidth = 200, maxHeight = 150) {
  try {
    // 在当前活动标签页中执行生成缩略图的操作
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      console.warn('无法获取当前标签页，使用原图作为缩略图');
      return imageData;
    }
    
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: createThumbnailInContent,
      args: [imageData, maxWidth, maxHeight]
    });
    
    if (result && result[0] && result[0].result) {
      return result[0].result;
    } else {
      console.warn('缩略图生成失败，使用原图');
      return imageData;
    }
  } catch (error) {
    console.error('生成缩略图失败:', error);
    return imageData; // 失败时返回原图
  }
}

// 在content script中创建缩略图
function createThumbnailInContent(imageDataUrl, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = function() {
      try {
        // 计算缩略图尺寸，保持宽高比
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;
          
          if (aspectRatio > maxWidth / maxHeight) {
            // 宽度为限制因子
            width = maxWidth;
            height = width / aspectRatio;
          } else {
            // 高度为限制因子
            height = maxHeight;
            width = height * aspectRatio;
          }
        }
        
        // 创建canvas生成缩略图
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        
        // 绘制缩放后的图片
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // 转换为base64，使用较低质量以减小文件大小
        const thumbnailData = canvas.toDataURL('image/jpeg', 0.7);
        
        resolve(thumbnailData);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = function() {
      reject(new Error('图片加载失败'));
    };
    
    img.src = imageDataUrl;
  });
}



// 读取文件内容
async function readFileContent(filePath) {
  try {
    // 使用fetch读取文件
    // 在Windows上需要将反斜杠转换为正斜杠用于URL
    const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // 读取文件为ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();
    
    // 转换为base64
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    return btoa(binary);
    
  } catch (error) {
    console.error('读取文件失败:', filePath, error);
    throw new Error(`无法读取文件: ${error.message}`);
  }
}

// 获取下载目录路径
async function getDownloadPath() {
  try {
    // 通过创建一个临时下载来获取默认下载目录
    const testUrl = 'data:text/plain;base64,dGVzdA=='; // "test" 的 base64
    const downloadId = await chrome.downloads.download({
      url: testUrl,
      filename: 'webSnap/temp_test_file.txt'
    });
    
    // 等待下载完成
    return new Promise((resolve, reject) => {
      const checkDownload = () => {
        chrome.downloads.search({ id: downloadId }, (downloads) => {
          if (downloads && downloads.length > 0) {
            const download = downloads[0];
            if (download.state === 'complete') {
              // 获取文件路径并删除临时文件
              const filePath = download.filename;
              
              // 兼容不同操作系统的路径分隔符
              const webSnapIndex = filePath.lastIndexOf('/webSnap') !== -1 ? 
                  filePath.lastIndexOf('/webSnap') : 
                  filePath.lastIndexOf('\\webSnap');
              
              if (webSnapIndex !== -1) {
                  const downloadDir = filePath.substring(0, webSnapIndex);
                  
                  // 删除临时文件
                  chrome.downloads.removeFile(downloadId);
                  chrome.downloads.erase({ id: downloadId });
                  
                  resolve(downloadDir);
              } else {
                  // 如果找不到webSnap文件夹，使用文件所在目录
                  const lastSeparator = filePath.lastIndexOf('/') !== -1 ? 
                      filePath.lastIndexOf('/') : 
                      filePath.lastIndexOf('\\');
                  
                  if (lastSeparator !== -1) {
                      const downloadDir = filePath.substring(0, lastSeparator);
                      
                      // 删除临时文件
                      chrome.downloads.removeFile(downloadId);
                      chrome.downloads.erase({ id: downloadId });
                      
                      resolve(downloadDir);
                  } else {
                      reject(new Error('无法解析下载路径'));
                  }
              }
            } else if (download.state === 'in_progress') {
              setTimeout(checkDownload, 100);
            } else {
              reject(new Error('下载失败'));
            }
          } else {
            reject(new Error('无法获取下载信息'));
          }
        });
      };
      checkDownload();
    });
    
  } catch (error) {
    console.error('获取下载目录失败:', error);
    // 降级方案：使用常见的下载目录
    if (navigator.platform.includes('Mac')) {
      return '/Users/luoxiansheng/Downloads';
    } else if (navigator.platform.includes('Win')) {
      // 在Windows上，通常下载目录是用户目录下的Downloads文件夹
      // 由于无法直接获取用户名，使用常见的默认路径
      // 如果这个路径不正确，用户可以在Chrome设置中查看实际的下载目录
      return 'C:\\Users\\luoxiansheng\\Downloads';
    } else {
      return '/home/luoxiansheng/Downloads';
    }
  }
}

// 从storage获取图片数据
async function getImageDataFromStorage(filename) {
  try {
    // 从storage中获取历史记录
    const result = await chrome.storage.local.get(['screenshotHistory']);
    const history = result.screenshotHistory || [];
    
    // 查找对应的历史记录
    const item = history.find(h => h.filename === filename);
    
    if (item && item.imageData) {
      return item.imageData;
    } else {
      // 如果没有保存的图片数据，尝试从下载目录读取文件
      const downloadPath = await getDownloadPath();
      // 根据操作系统使用正确的路径分隔符
      const pathSeparator = navigator.platform.includes('Win') ? '\\' : '/';
      const filePath = `${downloadPath}${pathSeparator}webSnap${pathSeparator}${filename}`;
      
      try {
        // 在Windows上需要将反斜杠转换为正斜杠用于URL
        const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
        const response = await fetch(fileUrl);
        if (response.ok) {
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(blob);
          });
        } else {
          throw new Error('文件不存在');
        }
      } catch (fileError) {
        throw new Error('无法读取图片文件');
      }
    }
    
  } catch (error) {
    console.error('获取图片数据失败:', error);
    throw new Error(`无法获取图片数据: ${error.message}`);
  }
}

// 获取整个webSnap文件夹的内容
async function getWebSnapFolderContent() {
  try {
    // 获取下载目录路径
    const downloadPath = await getDownloadPath();
    // 根据操作系统使用正确的路径分隔符
    const pathSeparator = navigator.platform.includes('Win') ? '\\' : '/';
    const webSnapPath = `${downloadPath}${pathSeparator}webSnap`;
    
    console.log('开始读取webSnap文件夹:', webSnapPath);
    
    // 从storage中获取历史记录，用于获取文件列表
    const result = await chrome.storage.local.get(['screenshotHistory']);
    const history = result.screenshotHistory || [];
    
    const files = [];
    let successCount = 0;
    let failCount = 0;
    
    // 遍历历史记录中的所有文件
    for (const item of history) {
      if (item.filename) {
        try {
          const filePath = `${webSnapPath}${pathSeparator}${item.filename}`;
          console.log('尝试读取文件:', filePath);
          
          // 在Windows上需要将反斜杠转换为正斜杠用于URL
          const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
          const response = await fetch(fileUrl);
          if (response.ok) {
            const blob = await response.blob();
            
            // 不再将文件内容转换为base64，而是只返回文件信息
            // 文件内容将在需要时单独获取
            files.push({
              name: item.filename,
              size: blob.size,
              type: blob.type,
              path: filePath,
              url: fileUrl
            });
            successCount++;
            console.log('成功读取文件信息:', item.filename);
          } else {
            console.warn('文件不存在:', item.filename);
            failCount++;
          }
        } catch (error) {
          console.warn('读取文件失败:', item.filename, error);
          failCount++;
        }
      }
    }
    
    console.log(`webSnap文件夹读取完成: 成功 ${successCount} 个文件, 失败 ${failCount} 个文件`);
    
    return {
      files: files,
      totalFiles: files.length,
      successCount: successCount,
      failCount: failCount,
      folderPath: webSnapPath
    };
    
  } catch (error) {
    console.error('获取webSnap文件夹内容失败:', error);
    throw new Error(`无法读取webSnap文件夹: ${error.message}`);
  }
}

// 获取单个文件的内容
async function getFileContent(fileUrl) {
  try {
    const response = await fetch(fileUrl);
    if (response.ok) {
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(blob);
      });
      return dataUrl;
    } else {
      throw new Error('文件不存在或无法访问');
    }
  } catch (error) {
    console.error('获取文件内容失败:', error);
    throw error;
  }
}

// 区域截图功能
async function captureAreaScreenshot(url, title) {
  try {
    console.log('开始区域截图:', { url, title });
    
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 注入选择区域的脚本
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: initAreaSelection
    });
    
    // 等待用户选择区域
    const selectionResult = await waitForAreaSelection(tab.id);
    
    if (!selectionResult || selectionResult.cancelled) {
      throw new Error('用户取消了区域选择');
    }
    
    // 进行截图
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 100
    });
    
    // 裁剪图片到选定区域
    const croppedImage = await cropImageInTab(tab.id, screenshot, selectionResult.area);
    
    // 生成文件名
    const filename = generateFilename(title + '_区域截图');
    
    // 下载图片
    const downloadResult = await downloadImage(croppedImage, filename);
    
    // 保存最近截图数据
    lastCaptureData = croppedImage;

    // 生成缩略图
    const thumbnailData = await generateThumbnail(croppedImage);
    
    console.log('区域截图完成:', filename);
    
    // 直接保存到历史记录
    await saveToHistoryInBackground(url, title, 'area', {
      filename: filename,
      downloadId: downloadResult.downloadId,
      fullPath: downloadResult.fullPath,
      thumbnail: thumbnailData
    });
    
    return {
      filename: filename,
      downloadId: downloadResult.downloadId,
      fullPath: downloadResult.fullPath
    };
    
  } catch (error) {
        console.error('文件上传失败:', error);
        throw error;
    }
}

// 自动同步定时器
let autoSyncTimer = null;

// 启动自动同步
function startAutoSync() {
    // 清除现有定时器
    if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
    }
    
    // 每隔1分钟检查一次
    autoSyncTimer = setInterval(async () => {
        try {
            await checkAndSyncPendingItems();
        } catch (error) {
            console.error('自动同步失败:', error);
        }
    }, 60000); // 60秒 = 1分钟
    
    console.log('自动同步已启动，每隔1分钟检查一次');
}

// 停止自动同步
function stopAutoSync() {
    if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
        autoSyncTimer = null;
        console.log('自动同步已停止');
    }
}

// 检查并同步待同步的项目
async function checkAndSyncPendingItems() {
    try {
        // 获取 Notion 配置
        const result = await chrome.storage.local.get(['notionConfig']);
        const notionConfig = result.notionConfig;
        
        // 如果没有配置 Notion，则不进行同步
        if (!notionConfig || !notionConfig.apiKey || !notionConfig.databaseId) {
            return;
        }
        
        // 获取历史记录
        const historyResult = await chrome.storage.local.get(['webSnapHistory']);
        const history = historyResult.webSnapHistory || [];
        
        // 获取同步状态记录
        const syncStatusResult = await chrome.storage.local.get(['notionSyncStatus']);
        const syncStatus = syncStatusResult.notionSyncStatus || {};
        
        // 找出未同步的项目
        const pendingItems = history.filter(item => {
            const itemKey = `${item.timestamp}_${item.filename}`;
            return !syncStatus[itemKey] || syncStatus[itemKey].status !== 'synced';
        });
        
        if (pendingItems.length === 0) {
            return; // 没有待同步的项目
        }
        
        console.log(`发现 ${pendingItems.length} 个待同步项目，开始自动同步...`);
        
        // 逐个同步
        for (const item of pendingItems) {
            try {
                const itemKey = `${item.timestamp}_${item.filename}`;
                
                // 更新同步状态为同步中
                syncStatus[itemKey] = {
                    status: 'syncing',
                    timestamp: Date.now()
                };
                await chrome.storage.local.set({ notionSyncStatus: syncStatus });
                
                // 执行同步
                await syncItemToNotion(item, notionConfig);
                
                // 更新同步状态为已同步
                syncStatus[itemKey] = {
                    status: 'synced',
                    timestamp: Date.now()
                };
                await chrome.storage.local.set({ notionSyncStatus: syncStatus });
                
                console.log(`项目 ${item.filename} 同步成功`);
                
            } catch (error) {
                console.error(`项目 ${item.filename} 同步失败:`, error);
                
                // 更新同步状态为失败
                const itemKey = `${item.timestamp}_${item.filename}`;
                syncStatus[itemKey] = {
                    status: 'failed',
                    timestamp: Date.now(),
                    error: error.message
                };
                await chrome.storage.local.set({ notionSyncStatus: syncStatus });
            }
        }
        
    } catch (error) {
        console.error('检查待同步项目失败:', error);
    }
}

// 同步单个项目到 Notion
async function syncItemToNotion(historyItem, notionConfig) {
    const pageData = {
        parent: {
            database_id: notionConfig.databaseId
        },
        properties: {
            'Title': {
                title: [{
                    text: {
                        content: historyItem.title || '未命名截图'
                    }
                }]
            },
            'URL': {
                url: historyItem.url || null
            },
            'Filename': {
                rich_text: [{
                    text: {
                        content: historyItem.filename || ''
                    }
                }]
            },
            'Type': {
                select: {
                    name: getScreenshotTypeText(historyItem.type)
                }
            },
            'Created': {
                date: {
                    start: new Date(historyItem.timestamp).toISOString()
                }
            },
            'Thumbnail': {
                files: await getThumbnailFileForSync(historyItem.thumbnail, notionConfig.apiKey)
            },
            'FilePath': {
                rich_text: [{
                    text: {
                        content: await getFilePathForItemSync(historyItem) || ''
                    }
                }]
            },
            'FilepathReal': {
                files: await getFilepathRealFileForSync(historyItem, notionConfig.apiKey)
            }
        }
    };
    
    const response = await handleNotionApiRequest({
        method: 'POST',
        url: 'https://api.notion.com/v1/pages',
        headers: {
            'Authorization': `Bearer ${notionConfig.apiKey}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
        },
        body: pageData
    });
    
    if (!response.success) {
        throw new Error(`Notion API 错误: ${response.error || '未知错误'}`);
    }
    
    return response.data;
}

// 获取截图类型文本（用于同步）
function getScreenshotTypeText(type) {
    switch (type) {
        case 'normal': return '普通截图';
        case 'full': return '长截图';
        case 'area': return '区域截图';
        default: return '未知类型';
    }
}

// 获取缩略图文件（用于同步）
async function getThumbnailFileForSync(thumbnailBase64, notionToken) {
    try {
        if (!thumbnailBase64 || !notionToken) {
            return [];
        }
        
        const uploadResult = await uploadImageToNotion(thumbnailBase64, notionToken);
        
        if (uploadResult && uploadResult.file_upload) {
            return [{
                name: 'thumbnail.png',
                type: 'file_upload',
                file_upload: {
                    id: uploadResult.file_upload.id
                }
            }];
        }
        
        return [];
    } catch (error) {
        console.error('获取缩略图文件失败:', error);
        return [];
    }
}

// 获取文件路径（用于同步）
async function getFilePathForItemSync(historyItem) {
    try {
        const downloadPath = await getDownloadPath();
        const pathSeparator = navigator.platform.includes('Win') ? '\\' : '/';
        const fullPath = `${downloadPath}${pathSeparator}webSnap${pathSeparator}${historyItem.filename}`;
        const fileUrl = `file://${fullPath.replace(/\\/g, '/')}`;
        return fileUrl;
    } catch (error) {
        console.error('获取文件路径失败:', error);
        return '';
    }
}

// 获取实际文件（用于同步）
async function getFilepathRealFileForSync(historyItem, notionToken) {
    try {
        if (!historyItem.filename || !notionToken) {
            return [];
        }
        
        const downloadPath = await getDownloadPath();
        const pathSeparator = navigator.platform.includes('Win') ? '\\' : '/';
        const fullPath = `${downloadPath}${pathSeparator}webSnap${pathSeparator}${historyItem.filename}`;
        
        const uploadResult = await uploadFileToNotion(fullPath, notionToken);
        
        if (uploadResult && uploadResult.file_upload) {
            return [{
                name: historyItem.filename,
                type: 'file_upload',
                file_upload: {
                    id: uploadResult.file_upload.id
                }
            }];
        }
        
        return [];
    } catch (error) {
        console.error('获取实际文件失败:', error);
        return [];
    }
}

// 监听存储变化（已禁用自动同步）
// chrome.storage.onChanged.addListener((changes, namespace) => {
//     if (namespace === 'local' && changes.notionConfig) {
//         const newConfig = changes.notionConfig.newValue;
//         
//         if (newConfig && newConfig.apiKey && newConfig.databaseId) {
//             // 配置完整，启动自动同步
//             startAutoSync();
//         } else {
//             // 配置不完整，停止自动同步
//             stopAutoSync();
//         }
//     }
// });

// 扩展启动时检查（已禁用自动同步）
// chrome.runtime.onStartup.addListener(async () => {
//     try {
//         const result = await chrome.storage.local.get(['notionConfig']);
//         const notionConfig = result.notionConfig;
//         
//         if (notionConfig && notionConfig.apiKey && notionConfig.databaseId) {
//             startAutoSync();
//         }
//     } catch (error) {
//         console.error('启动时检查自动同步配置失败:', error);
//     }
// });

// 扩展安装时检查（已禁用自动同步）
// chrome.runtime.onInstalled.addListener(async () => {
//     try {
//         const result = await chrome.storage.local.get(['notionConfig']);
//         const notionConfig = result.notionConfig;
//         
//         if (notionConfig && notionConfig.apiKey && notionConfig.databaseId) {
//             startAutoSync();
//         }
//     } catch (error) {
//         console.error('安装时检查自动同步配置失败:', error);
//     }
// });

// 在background script中保存历史记录
async function saveToHistoryInBackground(url, title, type, captureResult = null) {
  try {
    console.log('在background中保存历史记录:', { url, title, type, captureResult });
    
    const now = new Date();
    const filename = captureResult ? captureResult.filename : generateFilename(title);
    
    const historyItem = {
      id: Date.now().toString(),
      url: url,
      title: title,
      type: type, // 'normal', 'full', 或 'area'
      timestamp: now.toISOString(),
      filename: filename,
      date: now.toLocaleString('zh-CN'), // 预格式化的日期字符串
      downloadId: captureResult ? captureResult.downloadId : null,
      fullPath: captureResult ? captureResult.fullPath : null,
      // 新增：缩略图数据（data URL，较小体积）
      thumbnail: captureResult && captureResult.thumbnail ? captureResult.thumbnail : null
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

// 初始化区域选择功能
function initAreaSelection() {
  // 创建选择覆盖层
  const overlay = document.createElement('div');
  overlay.id = 'websnap-area-selector';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    cursor: crosshair;
  `;
  
  // 创建选择框
  const selectionBox = document.createElement('div');
  selectionBox.id = 'websnap-selection-box';
  selectionBox.style.cssText = `
    position: absolute;
    border: 2px dashed #007cff;
    background: rgba(0, 124, 255, 0.1);
    display: none;
    pointer-events: none;
  `;
  
  // 创建提示文字
  const hint = document.createElement('div');
  hint.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    font-size: 14px;
    z-index: 1000000;
  `;
  hint.textContent = '拖拽选择截图区域，按ESC取消';
  
  overlay.appendChild(selectionBox);
  overlay.appendChild(hint);
  document.body.appendChild(overlay);
  
  let isSelecting = false;
  let startX, startY;
  
  // 鼠标按下开始选择
  overlay.addEventListener('mousedown', (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
  });
  
  // 鼠标移动更新选择框
  overlay.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;
    
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  });
  
  // 鼠标抬起完成选择
  overlay.addEventListener('mouseup', (e) => {
    if (!isSelecting) return;
    
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    // 检查选择区域是否有效
    if (width < 10 || height < 10) {
      alert('选择区域太小，请重新选择');
      selectionBox.style.display = 'none';
      isSelecting = false;
      return;
    }
    
    // 发送选择结果
    window.webSnapAreaSelection = {
      left: left,
      top: top,
      width: width,
      height: height
    };
    
    // 移除覆盖层
    document.body.removeChild(overlay);
    
    // 等待一小段时间确保选择框完全消失后再截图
    setTimeout(() => {
      // 通知background script选择完成
      chrome.runtime.sendMessage({
        action: 'areaSelected',
        area: window.webSnapAreaSelection
      });
    }, 100); // 延迟100ms确保UI完全更新
  });
  
  // ESC键取消选择
   document.addEventListener('keydown', (e) => {
     if (e.key === 'Escape') {
       document.body.removeChild(overlay);
       chrome.runtime.sendMessage({
         action: 'areaSelectionCancelled'
       });
     }
   });
 }

// 等待用户选择区域
function waitForAreaSelection(tabId) {
  return new Promise((resolve) => {
    const messageListener = (request, sender, sendResponse) => {
      if (sender.tab && sender.tab.id === tabId) {
        if (request.action === 'areaSelected') {
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve({ area: request.area });
        } else if (request.action === 'areaSelectionCancelled') {
          chrome.runtime.onMessage.removeListener(messageListener);
          resolve({ cancelled: true });
        }
      }
    };
    
    chrome.runtime.onMessage.addListener(messageListener);
    
    // 设置超时
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(messageListener);
      resolve({ cancelled: true });
    }, 60000); // 60秒超时
  });
}

// 在content script中裁剪图片
async function cropImageInTab(tabId, imageDataUrl, area) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: cropImageInContent,
      args: [imageDataUrl, area]
    });
    
    const result = results[0].result;
    if (!result) {
      throw new Error('图片裁剪失败');
    }
    
    return result;
  } catch (error) {
    console.error('在content script中裁剪图片失败:', error);
    throw error;
  }
}

// 在content script中执行的裁剪函数
function cropImageInContent(imageDataUrl, area) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  
  // 计算设备像素比
  const devicePixelRatio = window.devicePixelRatio || 1;
  
  // 设置画布尺寸
  canvas.width = area.width * devicePixelRatio;
  canvas.height = area.height * devicePixelRatio;
  
  // 创建临时图片元素进行同步处理
  img.src = imageDataUrl;
  
  // 等待图片加载完成
  return new Promise((resolve) => {
    img.onload = () => {
      // 裁剪图片
      ctx.drawImage(
        img,
        area.left * devicePixelRatio,
        area.top * devicePixelRatio,
        area.width * devicePixelRatio,
        area.height * devicePixelRatio,
        0,
        0,
        area.width * devicePixelRatio,
        area.height * devicePixelRatio
      );
      
      // 转换为数据URL
      resolve(canvas.toDataURL('image/png'));
    };
    
    img.onerror = () => {
      resolve(null);
    };
  });
}

// 处理 Notion API 请求
async function handleNotionApiRequest(request) {
  const { method, url, headers, body } = request;
  
  try {
    const response = await fetch(url, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Notion API 请求失败:', error);
    throw error;
  }
}

// 压缩图片到指定大小以下（适用于 service worker 环境）
async function compressImage(base64Data, contentType, maxSize) {
  try {
    // 将 base64 转换为 ImageData
    const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const originalBlob = new Blob([byteArray], { type: contentType });
    
    // 如果原始文件已经小于等于最大大小，直接返回
    if (originalBlob.size <= maxSize) {
      return originalBlob;
    }
    
    // 使用 OffscreenCanvas 进行压缩
    const imageBitmap = await createImageBitmap(originalBlob);
    const { width, height } = imageBitmap;
    
    // 计算压缩比例
    let scaleFactor = Math.sqrt(maxSize / originalBlob.size * 0.8); // 预留一些空间
    let newWidth = Math.floor(width * scaleFactor);
    let newHeight = Math.floor(height * scaleFactor);
    
    // 创建 OffscreenCanvas
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    
    // 绘制压缩后的图片
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
    
    // 二分法查找合适的压缩质量
    let quality = 0.9;
    let minQuality = 0.1;
    let maxQuality = 0.9;
    
    while (maxQuality - minQuality > 0.01) {
      const blob = await canvas.convertToBlob({ type: contentType, quality });
      
      if (blob.size <= maxSize) {
        // 文件大小合适，可以尝试提高质量
        minQuality = quality;
        quality = (minQuality + maxQuality) / 2;
        
        // 如果已经很接近最大质量，返回当前结果
        if (maxQuality - quality < 0.05) {
          return blob;
        }
      } else {
        // 文件还是太大，降低质量
        maxQuality = quality;
        quality = (minQuality + maxQuality) / 2;
      }
    }
    
    // 返回最终压缩结果
    return await canvas.convertToBlob({ type: contentType, quality });
    
  } catch (error) {
    console.error('图片压缩失败:', error);
    // 如果压缩失败，返回原始数据的简单压缩版本
    const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }
}

// 将 base64 图片上传到 Notion
async function uploadImageToNotion(base64Data, notionToken) {
  try {
    // 移除 base64 前缀
    const base64Content = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // 将 base64 转换为 Blob
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    let blob = new Blob([byteArray], { type: 'image/png' });
    
    // 检查文件大小，如果大于 5MB，则进行压缩
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (blob.size > maxSize) {
      console.log(`缩略图大小 ${(blob.size / 1024 / 1024).toFixed(2)}MB 超过 5MB 限制，开始压缩...`);
      blob = await compressImage(base64Data, 'image/png', maxSize);
      console.log(`压缩后缩略图大小: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    }
    
    // 步骤1: 创建文件上传对象
    const createUploadResponse = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filename: 'thumbnail.png',
        content_type: 'image/png'
      })
    });
    
    if (!createUploadResponse.ok) {
      const errorText = await createUploadResponse.text();
      throw new Error(`创建文件上传对象失败: ${createUploadResponse.status} - ${errorText}`);
    }
    
    const uploadObject = await createUploadResponse.json();
    const { id: fileUploadId, upload_url } = uploadObject;
    
    // 步骤2: 使用 upload_url 上传文件内容
    const formData = new FormData();
    formData.append('file', blob, 'thumbnail.png');
    
    const sendUploadResponse = await fetch(upload_url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28'
      },
      body: formData
    });
    
    if (!sendUploadResponse.ok) {
      const errorText = await sendUploadResponse.text();
      throw new Error(`文件内容上传失败: ${sendUploadResponse.status} - ${errorText}`);
    }
    
    // 返回文件上传 ID，用于在 Notion 中引用
    return {
      type: 'file_upload',
      file_upload: {
        id: fileUploadId
      }
    };
  } catch (error) {
    console.error('图片上传到 Notion 失败:', error);
    throw error;
  }
}

// 读取本地文件并上传到 Notion
async function uploadFileToNotion(filePath, notionToken) {
  try {
    // 读取文件内容
    const fileContent = await readFileContent(filePath);
    if (!fileContent) {
      throw new Error('无法读取文件内容');
    }
    
    // 从文件路径中提取文件名
    const fileName = filePath.split('/').pop() || 'unknown_file';
    
    // 根据文件扩展名确定 MIME 类型
    const extension = fileName.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream'; // 默认类型
    
    const mimeTypes = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'json': 'application/json',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'text/javascript'
    };
    
    if (extension && mimeTypes[extension]) {
      contentType = mimeTypes[extension];
    }
    
    // 将 base64 转换为 Blob
    const base64Content = fileContent.replace(/^data:[^;]+;base64,/, '');
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    let blob = new Blob([byteArray], { type: contentType });
    
    // 检查文件大小，如果大于 5MB 且是图片，则进行压缩
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (blob.size > maxSize && contentType.startsWith('image/')) {
      console.log(`文件大小 ${(blob.size / 1024 / 1024).toFixed(2)}MB 超过 5MB 限制，开始压缩...`);
      blob = await compressImage(fileContent, contentType, maxSize);
      console.log(`压缩后文件大小: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    }
    
    // 步骤1: 创建文件上传对象
    const createUploadResponse = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filename: fileName,
        content_type: contentType
      })
    });
    
    if (!createUploadResponse.ok) {
      const errorText = await createUploadResponse.text();
      throw new Error(`创建文件上传对象失败: ${createUploadResponse.status} - ${errorText}`);
    }
    
    const uploadObject = await createUploadResponse.json();
    const { id: fileUploadId, upload_url } = uploadObject;
    
    // 步骤2: 使用 upload_url 上传文件内容
    const formData = new FormData();
    formData.append('file', blob, fileName);
    
    const sendUploadResponse = await fetch(upload_url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28'
      },
      body: formData
    });
    
    if (!sendUploadResponse.ok) {
      const errorText = await sendUploadResponse.text();
      throw new Error(`文件内容上传失败: ${sendUploadResponse.status} - ${errorText}`);
    }
    
    // 返回文件上传 ID，用于在 Notion 中引用
    return {
      type: 'file_upload',
      file_upload: {
        id: fileUploadId
      }
    };
  } catch (error) {
    console.error('文件上传到 Notion 失败:', error);
    throw error;
  }
}