console.log('WebSnap 历史记录页面开始加载...');

document.addEventListener('DOMContentLoaded', async function() {
    console.log('历史记录页面 DOMContentLoaded');
    
    const loadingDiv = document.getElementById('loadingDiv');
    const historyContainer = document.getElementById('historyContainer');
    const timelineContainer = document.getElementById('timelineContainer');
    const emptyState = document.getElementById('emptyState');
    const appreciationModal = document.getElementById('appreciationModal');
    const closeAppreciation = document.getElementById('closeAppreciation');
    const appreciationTip = document.getElementById('appreciationTip');
    const statsText = document.getElementById('statsText');
    const searchBox = document.getElementById('searchBox');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');
    const gridSizeSelect = document.getElementById('gridSizeSelect');
    const viewModeSelect = document.getElementById('viewModeSelect');
    
    let allHistory = [];
    let filteredHistory = [];
    let currentViewMode = 'grid'; // 当前视图模式：'grid' 或 'timeline'
    let currentHistory = []; // 当前显示的历史记录数据
    let syncIndicatorInterval = null; // 同步指示器定时器
    
    // 加载历史记录数据
    async function loadHistory() {
        try {
            console.log('开始加载历史记录...');
            const result = await chrome.storage.local.get(['screenshotHistory']);
            console.log('从storage获取的结果:', result);
            
            const history = result.screenshotHistory || [];
            console.log('解析后的history:', history);
            console.log('history类型:', typeof history);
            console.log('history是否为数组:', Array.isArray(history));
            console.log('加载到历史记录:', history.length, '条');
            
            // 确保返回的是数组
            if (!Array.isArray(history)) {
                console.error('storage中的数据不是数组!', history);
                return [];
            }
            
            return history;
        } catch (error) {
            console.error('加载历史记录失败:', error);
            return [];
        }
    }
    
    // 显示历史记录
    async function displayHistory(history) {
        console.log('开始显示历史记录，传入的参数:', history);
        console.log('参数类型:', typeof history);
        console.log('是否为数组:', Array.isArray(history));
        
        // 确保history是数组
        if (!Array.isArray(history)) {
            console.error('history不是数组！实际类型:', typeof history, '值:', history);
            history = []; // 设置为空数组作为默认值
        }
        
        // 保存当前历史记录数据
        currentHistory = history;
        
        console.log('处理后的history数量:', history.length);
        
        // 清空两个容器
        historyContainer.innerHTML = '';
        timelineContainer.innerHTML = '';
        
        if (history.length === 0) {
            loadingDiv.style.display = 'none';
            historyContainer.style.display = 'none';
            timelineContainer.style.display = 'none';
            appreciationTip.style.display = 'none';
            appreciationModal.classList.remove('show');
            emptyState.style.display = 'block';
            statsText.textContent = '共 0 条记录';
            return;
        }
        
        // 更新统计信息
        const normalCount = history.filter(item => item.type === 'normal').length;
        const fullCount = history.filter(item => item.type === 'full').length;
        const areaCount = history.filter(item => item.type === 'area').length;
        statsText.textContent = `共 ${history.length} 条记录 (普通截图: ${normalCount}, 长截图: ${fullCount}, 区域截图: ${areaCount})`;
        
        // 根据当前视图模式显示不同布局
        if (currentViewMode === 'timeline') {
            await displayTimelineView(history);
        } else {
            await displayGridView(history);
        }
        
        loadingDiv.style.display = 'none';
        appreciationTip.style.display = 'block';
        appreciationModal.classList.remove('show');
        emptyState.style.display = 'none';
        
        // 初始化赞赏码事件
        console.log('准备初始化赞赏码事件，appreciationTip元素:', appreciationTip);
        initScrollListener();
        
        console.log('历史记录显示完成');
    }
    
    // 显示网格视图
    async function displayGridView(history) {
        // 生成历史项目
        const historyItems = await Promise.all(history.map(item => createHistoryItem(item)));
        historyItems.forEach(historyItem => {
            historyContainer.appendChild(historyItem);
        });
        
        historyContainer.style.display = 'grid';
        timelineContainer.style.display = 'none';
    }
    
    // 显示时间轴视图
    async function displayTimelineView(history) {
        // 按日期分组历史记录
        const groupedHistory = groupHistoryByDate(history);
        
        // 按日期倒序排列
        const sortedDates = Object.keys(groupedHistory).sort((a, b) => new Date(b) - new Date(a));
        
        const timelineItems = await Promise.all(sortedDates.map(date => createTimelineItem(date, groupedHistory[date])));
        timelineItems.forEach(timelineItem => {
            timelineContainer.appendChild(timelineItem);
        });
        
        historyContainer.style.display = 'none';
        timelineContainer.style.display = 'block';
        timelineContainer.classList.add('active');
    }
    
    // 按日期分组历史记录
    function groupHistoryByDate(history) {
        const grouped = {};
        
        history.forEach(item => {
            const timestamp = item.timestamp || Date.now();
            const date = new Date(timestamp);
            const dateKey = date.toLocaleDateString('zh-CN');
            
            if (!grouped[dateKey]) {
                grouped[dateKey] = [];
            }
            grouped[dateKey].push(item);
        });
        
        return grouped;
    }
    
    // 创建时间轴项目
    async function createTimelineItem(date, items) {
        const timelineItemDiv = document.createElement('div');
        timelineItemDiv.className = 'timeline-item';
        
        const dateObj = new Date(date);
        const weekday = dateObj.toLocaleDateString('zh-CN', { weekday: 'long' });
        const formattedDate = dateObj.toLocaleDateString('zh-CN', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        timelineItemDiv.innerHTML = `
            <div class="timeline-date">
                <div class="timeline-date-text">${formattedDate}</div>
                <div class="timeline-date-sub">${weekday} · ${items.length} 张截图</div>
            </div>
            <div class="timeline-content">
                <div class="timeline-screenshots"></div>
            </div>
        `;
        
        const screenshotsContainer = timelineItemDiv.querySelector('.timeline-screenshots');
        
        // 设置网格大小属性
        const currentGridSize = gridSizeSelect.value || '3';
        screenshotsContainer.setAttribute('data-grid-size', currentGridSize);
        
        // 按时间倒序排列当天的截图
        const sortedItems = items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        const screenshotDivs = await Promise.all(sortedItems.map(item => createTimelineScreenshot(item)));
        screenshotDivs.forEach(screenshotDiv => {
            screenshotsContainer.appendChild(screenshotDiv);
        });
        
        return timelineItemDiv;
    }
    
    // 创建时间轴截图项目
    async function createTimelineScreenshot(item) {
        const screenshotDiv = document.createElement('div');
        screenshotDiv.className = 'timeline-screenshot';
        
        const title = item.title || item.filename || '未知标题';
        const filename = item.filename || '未知文件';
        const url = item.url || '未知URL';
        const time = new Date(item.timestamp || Date.now()).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const type = item.type || 'unknown';
        const thumbHTML = item.thumbnail ? `<div class="item-thumb"><img src="${item.thumbnail}" alt="缩略图"></div>` : '';
        
        // 检查是否需要显示同步状态
        let syncStatusHTML = '';
        try {
            const result = await chrome.storage.local.get(['notionConfig']);
            if (result.notionConfig && result.notionConfig.isConfigured) {
                const syncStatus = await getSyncStatus(item);
                syncStatusHTML = `<div class="sync-status ${syncStatus.class}" title="Notion同步状态">${syncStatus.text}</div>`;
            }
        } catch (error) {
            console.error('检查Notion配置失败:', error);
        }
        
        screenshotDiv.innerHTML = `
            <div class="item-header">
                <div class="item-title" title="${filename}">📄 ${filename}</div>
                <div class="item-type">${type === 'full' ? '📏 长截图' : type === 'area' ? '🔲 区域截图' : '📸 普通截图'}</div>
            </div>
            <div class="item-subtitle" title="${title}">${title}</div>
            <div class="item-url" title="${url}">🌐 ${url}</div>
            ${thumbHTML}
            <div class="item-date">
                <span>⏰ ${time}</span>
            </div>
            ${syncStatusHTML}
            <div class="item-actions">
                <button class="item-btn primary view-image-btn" data-filename="${filename}">🖼️ 图片</button>
                <button class="item-btn details-btn">📋 详情</button>
                <button class="item-btn edit-btn">✏️ 编辑</button>
                <button class="item-btn delete-btn">🗑️ 删除</button>
            </div>
        `;
        
        // 添加事件监听器
        addItemEventListeners(screenshotDiv, item);
        
        return screenshotDiv;
    }
    
    // 为项目添加事件监听器
    function addItemEventListeners(itemElement, item) {
        // 点击查看详情按钮显示弹窗
        const detailsBtn = itemElement.querySelector('.details-btn');
        detailsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showItemDetails(item);
        });
        
        // 点击查看图片按钮
        const viewImageBtn = itemElement.querySelector('.view-image-btn');
        viewImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openImageFile(item);
        });
        
        // 点击编辑按钮
        const editBtn = itemElement.querySelector('.edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditModal(item);
        });
        
        // 点击删除按钮
        const deleteBtn = itemElement.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteModal(item);
        });
        
        // 点击URL跳转到对应网页
        const urlElement = itemElement.querySelector('.item-url');
        if (urlElement && item.url && item.url !== '未知URL') {
            urlElement.style.cursor = 'pointer';
            urlElement.addEventListener('click', (e) => {
                e.stopPropagation();
                chrome.tabs.create({ url: item.url });
            });
        }
        
        // 点击缩略图查看图片
        const thumbElement = itemElement.querySelector('.item-thumb');
        if (thumbElement) {
            thumbElement.style.cursor = 'pointer';
            thumbElement.addEventListener('click', (e) => {
                e.stopPropagation();
                openImageFile(item);
            });
        }
    }
    
    // 获取同步状态
    async function getSyncStatus(item) {
        try {
            // 获取已同步的记录列表
            const result = await chrome.storage.local.get(['syncedNotionRecords']);
            const syncedRecords = result.syncedNotionRecords || [];
            
            // 根据文件名判断是否已同步
            const filename = item.filename || '';
            if (syncedRecords.includes(filename)) {
                return { status: 'synced', text: '✅ 已同步', class: 'sync-status-synced' };
            }
            
            // 检查是否正在同步中（可以通过时间戳判断最近是否尝试过同步）
            const now = Date.now();
            const itemTime = item.timestamp || 0;
            const timeDiff = now - itemTime;
            
            // 如果是最近5分钟内的记录且没有同步，可能正在同步中
            if (timeDiff < 5 * 60 * 1000 && !syncedRecords.includes(filename)) {
                return { status: 'syncing', text: '🔄 同步中', class: 'sync-status-syncing' };
            }
            
            // 否则显示未同步
            return { status: 'pending', text: '⏳ 待同步', class: 'sync-status-pending' };
        } catch (error) {
            console.error('获取同步状态失败:', error);
            return { status: 'pending', text: '⏳ 待同步', class: 'sync-status-pending' };
        }
    }
    
    // 更新同步指示器
    async function updateSyncIndicator() {
        const syncIndicator = document.getElementById('syncIndicator');
        const syncIndicatorText = document.getElementById('syncIndicatorText');
        const syncIndicatorIcon = syncIndicator.querySelector('.sync-indicator-icon');
        
        try {
            // 检查是否配置了 Notion
            const config = await chrome.storage.local.get(['notionToken', 'notionDatabaseId']);
            
            if (!config.notionToken || !config.notionDatabaseId) {
                syncIndicator.style.display = 'none';
                return;
            }
            
            // 显示同步指示器
            syncIndicator.style.display = 'block';
            
            // 统计同步状态
            const history = await loadHistory();
            const result = await chrome.storage.local.get(['syncedNotionRecords']);
            const syncedRecords = result.syncedNotionRecords || [];
            const syncedCount = history.filter(item => syncedRecords.includes(item.filename || '')).length;
            const totalCount = history.length;
            const pendingCount = totalCount - syncedCount;
            
            if (pendingCount === 0) {
                // 全部已同步
                syncIndicator.className = 'sync-indicator synced';
                syncIndicatorIcon.textContent = '✅';
                syncIndicatorText.textContent = `已同步 ${syncedCount}/${totalCount} 条记录`;
            } else {
                // 有待同步的记录
                syncIndicator.className = 'sync-indicator';
                syncIndicatorIcon.textContent = '🔄';
                syncIndicatorText.textContent = `同步中... ${syncedCount}/${totalCount} 条已完成`;
            }
        } catch (error) {
            console.error('更新同步指示器失败:', error);
            syncIndicator.style.display = 'none';
        }
    }
    
    // 启动同步指示器定时器
    function startSyncIndicator() {
        // 立即更新一次
        updateSyncIndicator();
        
        // 每30秒更新一次
        if (syncIndicatorInterval) {
            clearInterval(syncIndicatorInterval);
        }
        syncIndicatorInterval = setInterval(updateSyncIndicator, 30000);
    }
    
    // 停止同步指示器定时器
    function stopSyncIndicator() {
        if (syncIndicatorInterval) {
            clearInterval(syncIndicatorInterval);
            syncIndicatorInterval = null;
        }
        const syncIndicator = document.getElementById('syncIndicator');
        syncIndicator.style.display = 'none';
    }
    
    // 创建历史项目元素
    async function createHistoryItem(item) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-item';
        
        const title = item.title || item.filename || '未知标题';
        const filename = item.filename || '未知文件';
        const url = item.url || '未知URL';
        const date = item.date || new Date(item.timestamp || Date.now()).toLocaleString('zh-CN');
        const type = item.type || 'unknown';
        const thumbHTML = item.thumbnail ? `<div class="item-thumb"><img src="${item.thumbnail}" alt="缩略图"></div>` : '';
        
        // 检查是否需要显示同步状态
        let syncStatusHTML = '';
        try {
            const result = await chrome.storage.local.get(['notionConfig']);
            if (result.notionConfig && result.notionConfig.isConfigured) {
                 const syncStatus = await getSyncStatus(item);
                 syncStatusHTML = `<div class="sync-status ${syncStatus.class}" title="Notion同步状态">${syncStatus.text}</div>`;
             }
        } catch (error) {
            console.error('检查Notion配置失败:', error);
        }
        
        itemDiv.innerHTML = `
            <div class="item-header">
                <div class="item-title" title="${filename}">📄 ${filename}</div>
                <div class="item-type">${type === 'full' ? '📏 长截图' : type === 'area' ? '🔲 区域截图' : '📸 普通截图'}</div>
            </div>
            <div class="item-subtitle" title="${title}">${title}</div>
            <div class="item-url" title="${url}">🌐 ${url}</div>
            ${thumbHTML}
            <div class="item-date">
                <span>📅 ${date}</span>
            </div>
            ${syncStatusHTML}
            <div class="item-actions">
                <button class="item-btn primary view-image-btn" data-filename="${filename}">🖼️ 图片</button>
                <button class="item-btn details-btn">📋 详情</button>
                <button class="item-btn edit-btn">✏️ 编辑</button>
                <button class="item-btn delete-btn">🗑️ 删除</button>
            </div>
        `;
        
        // 点击查看详情按钮显示弹窗
        const detailsBtn = itemDiv.querySelector('.details-btn');
        detailsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showItemDetails(item);
        });
        
        // 点击查看图片按钮
        const viewImageBtn = itemDiv.querySelector('.view-image-btn');
        viewImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openImageFile(item);
        });
        
        // 点击编辑按钮
        const editBtn = itemDiv.querySelector('.edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditModal(item);
        });
        
        // 添加事件监听器
        addItemEventListeners(itemDiv, item);
        
        return itemDiv;
    }
    
    // 显示项目详细信息
    function showItemDetails(item) {
        const details = `截图详情：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 文件名：${item.filename || '未知文件'}
📝 页面标题：${item.title || '未知标题'}
🌐 网页地址：${item.url || '未知URL'}
⏰ 截图时间：${item.date || new Date(item.timestamp || Date.now()).toLocaleString('zh-CN')}
📷 截图类型：${item.type === 'full' ? '长截图' : item.type === 'area' ? '区域截图' : '普通截图'}
🆔 记录ID：${item.id || '未知ID'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        const modal = document.getElementById('detailModal');
        const modalContent = document.getElementById('modalContent');
        
        modalContent.textContent = details;
        modal.style.display = 'flex';
        
        // 存储当前详情用于复制
        window.currentDetails = details;
    }
    
    // 打开图片文件
    async function openImageFile(item) {
        console.log('开始打开图片文件:', item);
        
        const filename = typeof item === 'string' ? item : item.filename;
        if (!filename) {
            alert('❌ 文件信息不存在');
            return;
        }
        
        try {
            // 使用 Chrome API 获取下载目录
            const downloadPath = await getDownloadPath();
            
            // 根据操作系统使用正确的路径分隔符
            const pathSeparator = navigator.platform.includes('Win') ? '\\' : '/';
            const fullPath = `${downloadPath}${pathSeparator}webSnap${pathSeparator}${filename}`;
            console.log('尝试打开文件路径:', fullPath);
            
            // 构建file://协议的URL在浏览器中打开
            // 在Windows上需要将反斜杠转换为正斜杠用于URL
            const fileUrl = `file://${fullPath.replace(/\\/g, '/')}`;
            await chrome.tabs.create({ url: fileUrl });
            
        } catch (error) {
            console.error('打开文件失败:', error);
            // 如果直接打开失败，提供备选方案
            const pathSeparator = navigator.platform.includes('Win') ? '\\' : '/';
            let downloadPathHint = 'Downloads/webSnap';
            if (navigator.platform.includes('Win')) {
                downloadPathHint = 'C:\\Users\\[您的用户名]\\Downloads\\webSnap';
            } else if (navigator.platform.includes('Mac')) {
                downloadPathHint = '/Users/[您的用户名]/Downloads/webSnap';
            }
            
            alert(`📸 无法自动在浏览器中打开图片文件。\n\n文件名: ${filename}\n\n您可以：\n1. 打开文件管理器\n2. 导航到 ${downloadPathHint} 文件夹\n3. 找到文件名为 "${filename}" 的图片\n4. 右键选择"打开方式" → "浏览器"\n\n💡 提示：您可以在Chrome设置 → 高级 → 下载内容中查看实际的下载目录`);
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
    
    // 搜索功能
    async function filterHistory(searchTerm) {
        console.log('开始搜索，搜索词:', searchTerm);
        console.log('allHistory类型:', typeof allHistory, '是否为数组:', Array.isArray(allHistory));
        
        // 确保allHistory是数组
        if (!Array.isArray(allHistory)) {
            console.error('allHistory不是数组!', allHistory);
            allHistory = [];
        }
        
        if (!searchTerm.trim()) {
            filteredHistory = allHistory;
        } else {
            const term = searchTerm.toLowerCase();
            filteredHistory = allHistory.filter(item => {
                const title = (item.title || '').toLowerCase();
                const filename = (item.filename || '').toLowerCase();
                const url = (item.url || '').toLowerCase();
                const date = (item.date || '').toLowerCase();
                const timestamp = item.timestamp || '';
                
                // 基本文本匹配
                let matches = title.includes(term) || 
                             filename.includes(term) || 
                             url.includes(term) ||
                             date.includes(term);
                
                // 时间匹配增强
                if (!matches && timestamp) {
                    try {
                        const itemDate = new Date(timestamp);
                        
                        // 支持多种日期格式搜索
                        const dateFormats = [
                            itemDate.getFullYear().toString(), // 年份：2024
                            (itemDate.getMonth() + 1).toString().padStart(2, '0'), // 月份：01-12
                            itemDate.getDate().toString().padStart(2, '0'), // 日期：01-31
                            itemDate.toLocaleDateString('zh-CN'), // 中文日期：2024/1/1
                            itemDate.toLocaleDateString('en-US'), // 英文日期：1/1/2024
                            itemDate.toISOString().split('T')[0], // ISO日期：2024-01-01
                            `${itemDate.getFullYear()}-${(itemDate.getMonth() + 1).toString().padStart(2, '0')}`, // 年-月：2024-01
                            `${(itemDate.getMonth() + 1).toString().padStart(2, '0')}-${itemDate.getDate().toString().padStart(2, '0')}`, // 月-日：01-01
                            itemDate.toLocaleDateString('zh-CN', { weekday: 'long' }), // 星期：星期一
                            itemDate.toLocaleDateString('zh-CN', { month: 'long' }), // 月份名：一月
                            itemDate.getHours().toString().padStart(2, '0'), // 小时：00-23
                            `${itemDate.getHours().toString().padStart(2, '0')}:${itemDate.getMinutes().toString().padStart(2, '0')}` // 时:分：14:30
                        ];
                        
                        // 检查是否匹配任何日期格式
                        matches = dateFormats.some(format => 
                            format.toLowerCase().includes(term)
                        );
                        
                        // 支持相对时间搜索
                        if (!matches) {
                            const now = new Date();
                            const diffDays = Math.floor((now - itemDate) / (1000 * 60 * 60 * 24));
                            
                            if (term === '今天' && diffDays === 0) matches = true;
                            else if (term === '昨天' && diffDays === 1) matches = true;
                            else if (term === '前天' && diffDays === 2) matches = true;
                            else if (term === '本周' && diffDays <= 7) matches = true;
                            else if (term === '本月' && itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear()) matches = true;
                            else if (term === '本年' && itemDate.getFullYear() === now.getFullYear()) matches = true;
                        }
                    } catch (error) {
                        console.warn('解析时间戳失败:', timestamp, error);
                    }
                }
                
                return matches;
            });
        }
        
        console.log('搜索结果:', filteredHistory.length, '条');
        await displayHistory(filteredHistory);
    }
    
    // 显示导出选择弹窗
    function showExportModal() {
        const modal = document.getElementById('exportModal');
        modal.style.display = 'flex';
    }

    // 关闭导出选择弹窗
    function closeExportModal() {
        const modal = document.getElementById('exportModal');
        modal.style.display = 'none';
    }

    // 导出历史记录（仅数据）
    async function exportHistoryData() {
        try {
            if (allHistory.length === 0) {
                alert('❌ 没有历史记录可导出');
                return;
            }
            
            const exportData = {
                version: '1.0',
                exportTime: new Date().toISOString(),
                count: allHistory.length,
                history: allHistory
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `websnap_history_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log('历史记录已导出');
            closeExportModal();
        } catch (error) {
            console.error('导出失败:', error);
            alert('❌ 导出失败: ' + error.message);
        }
    }

    // 导入历史记录数据
    function importHistoryData() {
        // 触发文件选择
        document.getElementById('importFileInput').click();
    }

    // 处理文件导入
    async function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        try {
            console.log('开始导入文件:', file.name);
            
            // 读取文件内容
            const text = await file.text();
            let importData;
            
            try {
                importData = JSON.parse(text);
            } catch (parseError) {
                alert('❌ 文件格式错误：不是有效的JSON文件');
                return;
            }
            
            // 校验JSON内容
            if (!validateImportData(importData)) {
                alert('❌ 文件校验失败：文件必须包含 version、exportTime、count、history 字段');
                return;
            }
            
            // 确认导入
            const confirmMessage = `确认导入 ${importData.count} 条历史记录吗？\n\n这将覆盖当前的所有历史记录。`;
            if (!confirm(confirmMessage)) {
                return;
            }
            
            // 执行导入
            await performImport(importData);
            
        } catch (error) {
            console.error('导入失败:', error);
            alert('❌ 导入失败: ' + error.message);
        } finally {
            // 清空文件输入，允许重复选择同一文件
            event.target.value = '';
        }
    }

    // 校验导入数据
    function validateImportData(data) {
        return data && 
               typeof data.version === 'string' &&
               typeof data.exportTime === 'string' &&
               typeof data.count === 'number' &&
               Array.isArray(data.history);
    }

    // 执行导入操作
    async function performImport(importData) {
        try {
            console.log('开始执行导入操作...');
            
            // 保存到chrome.storage.local
            await chrome.storage.local.set({
                screenshotHistory: importData.history
            });
            
            console.log('导入完成，共导入', importData.history.length, '条记录');
            
            // 刷新显示
            await refreshHistory();
            
            // 关闭弹窗
            closeExportModal();
            
            // 显示成功提示
            alert(`✅ 导入成功！\n\n共导入 ${importData.history.length} 条历史记录`);
            
        } catch (error) {
            console.error('保存导入数据失败:', error);
            throw new Error('保存数据失败: ' + error.message);
        }
    }

    // 导出历史记录（包含图片）
    async function exportHistoryWithImages() {
        try {
            if (allHistory.length === 0) {
                alert('❌ 没有历史记录可导出');
                return;
            }

            // 显示加载提示
            const loadingText = document.createElement('div');
            loadingText.textContent = '正在准备导出包，请稍候...';
            loadingText.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 20px 30px;
                border-radius: 10px;
                z-index: 10000;
                font-size: 16px;
            `;
            document.body.appendChild(loadingText);

            try {
                // 创建导出数据
                const exportData = {
                    version: '1.0',
                    exportTime: new Date().toISOString(),
                    count: allHistory.length,
                    history: allHistory
                };

                // 创建zip文件
                const zip = new JSZip();
                
                // 添加配置文件
                zip.file('config.json', JSON.stringify(exportData, null, 2));
                
                // 通过background script获取整个webSnap文件夹的内容
                const response = await chrome.runtime.sendMessage({
                    action: 'getWebSnapFolderContent'
                });
                
                if (response && response.success) {
                    const { files, totalFiles } = response;
                    let successCount = 0;
                    let failCount = 0;
                    
                    // 分批处理文件，避免消息长度超限
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        try {
                            // 更新加载提示
                            loadingText.textContent = `正在处理文件 ${i + 1}/${files.length}: ${file.name}`;
                            
                            // 单独获取文件内容
                            const fileResponse = await chrome.runtime.sendMessage({
                                action: 'getFileContent',
                                fileUrl: file.url
                            });
                            
                            if (fileResponse && fileResponse.success && fileResponse.data) {
                                // 将base64数据转换为ArrayBuffer
                                const base64Data = fileResponse.data.split(',')[1]; // 移除data:image/png;base64,前缀
                                const binaryString = atob(base64Data);
                                const bytes = new Uint8Array(binaryString.length);
                                for (let j = 0; j < binaryString.length; j++) {
                                    bytes[j] = binaryString.charCodeAt(j);
                                }
                                
                                // 保持原始文件名结构
                                zip.file(`webSnap/${file.name}`, bytes.buffer);
                                successCount++;
                            } else {
                                console.warn(`获取文件内容失败: ${file.name}`);
                                failCount++;
                            }
                        } catch (error) {
                            console.warn(`处理文件失败: ${file.name}`, error);
                            failCount++;
                        }
                    }

                    // 生成zip文件
                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    
                    // 下载zip文件
                    const url = URL.createObjectURL(zipBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `websnap_complete_${new Date().toISOString().split('T')[0]}.zip`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);

                    // 显示结果
                    let message = `✅ 导出完成！\n\n成功包含 ${successCount} 个文件`;
                    if (failCount > 0) {
                        message += `\n${failCount} 个文件无法获取（可能已被删除）`;
                    }
                    message += `\n\nZIP包中包含：\n- config.json (配置文件)\n- webSnap/ 文件夹 (完整的图片文件夹)`;
                    alert(message);
                    
                } else {
                    throw new Error(response?.error || '无法获取文件夹内容');
                }
                
                closeExportModal();
                
            } finally {
                // 移除加载提示
                document.body.removeChild(loadingText);
            }
            
        } catch (error) {
            console.error('导出失败:', error);
            alert('❌ 导出失败: ' + error.message);
        }
    }
    
    // 清空历史记录
    async function clearHistory() {
        if (!confirm(`确定要清空所有 ${allHistory.length} 条截图历史记录吗？\n\n此操作不可恢复！`)) {
            return;
        }
        
        try {
            await chrome.storage.local.set({ screenshotHistory: [] });
            allHistory = [];
            filteredHistory = [];
            await displayHistory([]);
            console.log('历史记录已清空');
            alert('✅ 历史记录已清空');
        } catch (error) {
            console.error('清空历史记录失败:', error);
            alert('❌ 清空失败: ' + error.message);
        }
    }
    
    // 复制详情到剪贴板
    async function copyDetails() {
        if (!window.currentDetails) {
            alert('❌ 没有可复制的内容');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(window.currentDetails);
            alert('✅ 详情已复制到剪贴板');
        } catch (error) {
            console.error('复制失败:', error);
            // 降级方案：使用传统的复制方法
            const textArea = document.createElement('textarea');
            textArea.value = window.currentDetails;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                alert('✅ 详情已复制到剪贴板');
            } catch (execError) {
                console.error('execCommand复制也失败:', execError);
                alert('❌ 复制失败，请手动选择文本复制');
            }
            document.body.removeChild(textArea);
        }
    }
    
    // 关闭弹窗
    function closeModal() {
        const modal = document.getElementById('detailModal');
        modal.style.display = 'none';
        window.currentDetails = null;
    }
    
    // 显示编辑弹窗
    function showEditModal(item) {
        const modal = document.getElementById('editModal');
        const filenameInput = document.getElementById('editFilename');
        const titleInput = document.getElementById('editTitle');
        const urlInput = document.getElementById('editUrl');
        
        // 填充当前数据
        filenameInput.value = item.filename || '';
        titleInput.value = item.title || '';
        urlInput.value = item.url || '';
        
        // 存储当前编辑的项目ID
        window.currentEditItemId = item.id;
        
        modal.style.display = 'flex';
    }
    
    // 关闭编辑弹窗
    function closeEditModal() {
        const modal = document.getElementById('editModal');
        modal.style.display = 'none';
        window.currentEditItemId = null;
    }
    
    // 保存编辑
    async function saveEdit() {
        if (!window.currentEditItemId) {
            alert('❌ 编辑失败：无法识别项目ID');
            return;
        }
        
        try {
            // 获取编辑后的值
            const filenameInput = document.getElementById('editFilename');
            const titleInput = document.getElementById('editTitle');
            const urlInput = document.getElementById('editUrl');
            
            const newFilename = filenameInput.value.trim();
            const newTitle = titleInput.value.trim();
            const newUrl = urlInput.value.trim();
            
            // 验证文件名不能为空
            if (!newFilename) {
                alert('❌ 文件名不能为空');
                return;
            }
            
            // 获取当前历史记录
            const result = await chrome.storage.local.get(['screenshotHistory']);
            let history = result.screenshotHistory || [];
            
            // 找到要编辑的项目
            const itemIndex = history.findIndex(item => item.id === window.currentEditItemId);
            if (itemIndex === -1) {
                alert('❌ 找不到要编辑的项目');
                return;
            }
            
            // 检查文件名是否变动
            const originalFilename = history[itemIndex].filename;
            if (originalFilename !== newFilename) {
                // 文件名变动，显示警告
                const confirmChange = confirm('⚠️ 警告：更改文件名可能导致图片无法查看！\n\n原文件名：' + originalFilename + '\n新文件名：' + newFilename + '\n\n确定要继续吗？');
                if (!confirmChange) {
                    return; // 用户取消操作
                }
            }
            
            // 更新项目
            history[itemIndex].filename = newFilename;
            history[itemIndex].title = newTitle;
            history[itemIndex].url = newUrl;
            
            // 保存更新后的历史记录
            await chrome.storage.local.set({ screenshotHistory: history });
            
            // 关闭弹窗并刷新显示
            closeEditModal();
            await refreshHistory();
        } catch (error) {
            console.error('保存编辑失败:', error);
            alert('❌ 编辑失败: ' + error.message);
        }
    }
    
    // 显示删除确认弹窗
    function showDeleteModal(item) {
        const modal = document.getElementById('deleteModal');
        
        // 存储当前要删除的项目ID
        window.currentDeleteItemId = item.id;
        
        modal.style.display = 'flex';
    }
    
    // 关闭删除确认弹窗
    function closeDeleteModal() {
        const modal = document.getElementById('deleteModal');
        modal.style.display = 'none';
        window.currentDeleteItemId = null;
    }
    
    // 确认删除
    async function confirmDelete() {
        if (!window.currentDeleteItemId) {
            alert('❌ 删除失败：无法识别项目ID');
            return;
        }
        
        try {
            // 获取当前历史记录
            const result = await chrome.storage.local.get(['screenshotHistory']);
            let history = result.screenshotHistory || [];
            
            // 找到要删除的项目
            const itemIndex = history.findIndex(item => item.id === window.currentDeleteItemId);
            if (itemIndex === -1) {
                alert('❌ 找不到要删除的项目');
                return;
            }
            
            // 删除项目
            history.splice(itemIndex, 1);
            
            // 保存更新后的历史记录
            await chrome.storage.local.set({ screenshotHistory: history });
            
            // 关闭弹窗并刷新显示
            closeDeleteModal();
            await refreshHistory();
            
        } catch (error) {
            console.error('删除失败:', error);
            alert('❌ 删除失败: ' + error.message);
        }
    }
    
    // 关闭页面并跳转到来源页面
    async function closePage() {
        try {
            // 获取当前标签页
            const currentTab = await chrome.tabs.getCurrent();
            
            // 从 URL 参数中获取来源页面信息
            const urlParams = new URLSearchParams(window.location.search);
            const sourceTabId = urlParams.get('sourceTabId');
            
            if (sourceTabId) {
                // 如果有来源页面ID，先激活来源页面，再关闭当前页面
                try {
                    await chrome.tabs.update(parseInt(sourceTabId), { active: true });
                } catch (error) {
                    console.log('来源页面不存在，使用默认行为');
                }
            }
            
            // 关闭当前标签页
            await chrome.tabs.remove(currentTab.id);
            
        } catch (error) {
            console.error('关闭页面失败:', error);
            // 降级方案：使用 window.close()
            window.close();
        }
    }
    
    // 事件监听器
    searchBox.addEventListener('input', async (e) => {
        await filterHistory(e.target.value);
    });
    
    exportBtn.addEventListener('click', showExportModal);
    clearBtn.addEventListener('click', clearHistory);
    
    // 添加刷新按钮的事件监听器
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshHistory);
    }
    
    // 添加关闭页面按钮的事件监听器
    const closePageBtn = document.getElementById('closePageBtn');
    if (closePageBtn) {
        closePageBtn.addEventListener('click', closePage);
    }
    
    // 添加空状态页面的关闭按钮事件监听器
    const emptyStateCloseBtn = document.getElementById('emptyStateCloseBtn');
    if (emptyStateCloseBtn) {
        emptyStateCloseBtn.addEventListener('click', closePage);
    }
    
    // 监听标签页切换事件，当历史页面重新激活时自动刷新（仅在扩展环境中可用）
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
        chrome.tabs.onActivated.addListener(async (activeInfo) => {
            try {
                // 获取当前标签页
                const currentTab = await chrome.tabs.getCurrent();
                
                // 如果当前激活的标签页是历史页面，则刷新
                if (currentTab && activeInfo.tabId === currentTab.id) {
                    console.log('历史页面被激活，自动刷新列表');
                    // 延迟一点时间确保页面完全加载
                    setTimeout(() => {
                        refreshHistory();
                }, 100);
            }
        } catch (error) {
            console.error('标签页切换监听失败:', error);
        }
        });
    }
    
    // 监听标签页更新事件，当历史页面重新加载时也刷新（仅在扩展环境中可用）
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
            try {
                // 获取当前标签页
                const currentTab = await chrome.tabs.getCurrent();
                
                // 如果更新的标签页是历史页面且状态为complete，则刷新
                if (currentTab && tabId === currentTab.id && changeInfo.status === 'complete') {
                    console.log('历史页面重新加载完成，自动刷新列表');
                    setTimeout(() => {
                        refreshHistory();
                    }, 100);
            }
        } catch (error) {
            console.error('标签页更新监听失败:', error);
        }
        });
    }
    
    // 弹窗事件监听器
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('copyDetailsBtn').addEventListener('click', copyDetails);
    
    // 导出弹窗事件监听器
    document.getElementById('closeExportModal').addEventListener('click', closeExportModal);
    document.getElementById('cancelExportBtn').addEventListener('click', closeExportModal);
    document.getElementById('exportDataOnlyBtn').addEventListener('click', exportHistoryData);
    document.getElementById('exportWithImagesBtn').addEventListener('click', exportHistoryWithImages);
    document.getElementById('importDataBtn').addEventListener('click', importHistoryData);
    
    // 编辑弹窗事件监听器
    document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
    document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
    
    // 删除弹窗事件监听器
    document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
    
    // 文件输入事件监听器
    document.getElementById('importFileInput').addEventListener('change', handleFileImport);
    
    // 点击弹窗背景关闭弹窗
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target.id === 'detailModal') {
            closeModal();
        }
    });
    
    document.getElementById('exportModal').addEventListener('click', (e) => {
        if (e.target.id === 'exportModal') {
            closeExportModal();
        }
    });
    
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') {
            closeEditModal();
        }
    });
    
    document.getElementById('deleteModal').addEventListener('click', (e) => {
        if (e.target.id === 'deleteModal') {
            closeDeleteModal();
        }
    });
    
    // ESC键关闭弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const detailModal = document.getElementById('detailModal');
            const exportModal = document.getElementById('exportModal');
            const editModal = document.getElementById('editModal');
            const deleteModal = document.getElementById('deleteModal');
            const notionConfigModal = document.getElementById('notionConfigModal');
            
            if (detailModal.style.display === 'flex') {
                closeModal();
            } else if (exportModal.style.display === 'flex') {
                closeExportModal();
            } else if (editModal.style.display === 'flex') {
                closeEditModal();
            } else if (deleteModal.style.display === 'flex') {
                closeDeleteModal();
            } else if (notionConfigModal && notionConfigModal.style.display === 'flex') {
                notionConfigModal.style.display = 'none';
            }
        }
    });
    
    // 刷新历史记录
    async function refreshHistory() {
        try {
            console.log('开始刷新历史记录...');
            loadingDiv.style.display = 'block';
            historyContainer.style.display = 'none';
            emptyState.style.display = 'none';
            loadingDiv.textContent = '正在刷新历史记录...';
            loadingDiv.style.color = 'white';
            
            allHistory = await loadHistory();
            filteredHistory = allHistory;
            await displayHistory(filteredHistory);
            
            console.log('历史记录刷新完成');
        } catch (error) {
            console.error('刷新失败:', error);
            loadingDiv.textContent = '❌ 刷新失败: ' + error.message;
            loadingDiv.style.color = '#ff6b6b';
        }
    }
    
    // 初始化加载
    try {
        console.log('开始初始化加载历史记录...');
        allHistory = await loadHistory();
        filteredHistory = allHistory;
        await displayHistory(filteredHistory);
    } catch (error) {
        console.error('初始化失败:', error);
        loadingDiv.textContent = '❌ 加载失败: ' + error.message;
        loadingDiv.style.color = '#ff6b6b';
    }
    
    // 初始化主题模式
    function initTheme() {
        // 检查本地存储中是否有主题设置
        chrome.storage.local.get(['themeMode'], function(result) {
            const savedTheme = result.themeMode || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                themeIcon.textContent = '🌙';
                themeText.textContent = '夜间模式';
            } else {
                document.body.classList.remove('dark-mode');
                themeIcon.textContent = '🌞';
                themeText.textContent = '日间模式';
            }
        });
    }
    
    // 切换主题模式
    function toggleTheme() {
        const isDarkMode = document.body.classList.contains('dark-mode');
        if (isDarkMode) {
            document.body.classList.remove('dark-mode');
            themeIcon.textContent = '🌞';
            themeText.textContent = '日间模式';
            chrome.storage.local.set({ themeMode: 'light' });
        } else {
            document.body.classList.add('dark-mode');
            themeIcon.textContent = '🌙';
            themeText.textContent = '夜间模式';
            chrome.storage.local.set({ themeMode: 'dark' });
        }
    }
    
    // 更新网格列数
    function updateGridSize(columns) {
        const size = parseInt(columns) || 3;
        const minWidth = size === 2 ? '450px' : size === 3 ? '360px' : size === 4 ? '280px' : '200px';
        historyContainer.style.gridTemplateColumns = `repeat(auto-fill, minmax(${minWidth}, 1fr))`;
        
        // 同时更新时间轴模式下的截图容器
        const timelineScreenshots = document.querySelectorAll('.timeline-screenshots');
        timelineScreenshots.forEach(container => {
            container.setAttribute('data-grid-size', size);
        });
        
        chrome.storage.local.set({ gridSize: size });
    }
    
    // 初始化网格大小
    function initGridSize() {
        chrome.storage.local.get(['gridSize'], function(result) {
            const savedSize = result.gridSize || 3;
            gridSizeSelect.value = savedSize;
            updateGridSize(savedSize);
        });
    }
    
    // 主题切换按钮点击事件
    themeToggle.addEventListener('click', toggleTheme);
    
    // 网格大小选择事件
    gridSizeSelect.addEventListener('change', function() {
        updateGridSize(this.value);
    });
    
    // 切换视图模式
    async function switchViewMode(mode) {
        currentViewMode = mode;
        chrome.storage.local.set({ viewMode: mode });
        
        // 重新显示历史记录
        await displayHistory(currentHistory);
    }
    
    // 初始化视图模式
    function initViewMode() {
        chrome.storage.local.get(['viewMode'], function(result) {
            const savedMode = result.viewMode || 'grid';
            currentViewMode = savedMode;
            viewModeSelect.value = savedMode;
        });
    }
    
    // 视图模式选择事件
    viewModeSelect.addEventListener('change', async function() {
        await switchViewMode(this.value);
    });
    
    // 初始化主题和网格大小
    initTheme();
    initGridSize();
    initViewMode();
    initNotionSync();
    
    // 初始化赞赏码事件
    function initScrollListener() {
        console.log('初始化赞赏码事件监听器');
        
        // 点击显示赞赏码模态弹窗
        appreciationTip.addEventListener('click', function() {
            console.log('点击显示赞赏码模态弹窗');
            appreciationModal.classList.add('show');
        });
        
        // 移除鼠标悬停文字变化效果
        
        // 关闭模态弹窗
        closeAppreciation.addEventListener('click', function() {
            console.log('关闭赞赏码模态弹窗');
            appreciationModal.classList.remove('show');
        });
        
        // 点击蒙版关闭弹窗
        appreciationModal.addEventListener('click', function(e) {
            if (e.target === appreciationModal) {
                console.log('点击蒙版关闭赞赏码模态弹窗');
                appreciationModal.classList.remove('show');
            }
        });
        
        // ESC键关闭弹窗
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && appreciationModal.classList.contains('show')) {
                console.log('ESC键关闭赞赏码模态弹窗');
                appreciationModal.classList.remove('show');
            }
        });
    }
    
    // Notion 同步功能
    function initNotionSync() {
        console.log('初始化 Notion 同步功能');
        
        const notionConfigBtn = document.getElementById('notionConfigBtn');
        const notionConfigModal = document.getElementById('notionConfigModal');
        const closeNotionConfigModal = document.getElementById('closeNotionConfigModal');
        const cancelNotionConfigBtn = document.getElementById('cancelNotionConfigBtn');
        const notionApiKey = document.getElementById('notionApiKey');
        const notionDatabaseId = document.getElementById('notionDatabaseId');
        const saveNotionConfigBtn = document.getElementById('saveNotionConfigBtn');
        const syncToNotionBtn = document.getElementById('syncToNotionBtn');
        const clearNotionConfigBtn = document.getElementById('clearNotionConfigBtn');
        const notionStatus = document.getElementById('notionStatus');
        const notionStatusIcon = document.getElementById('notionStatusIcon');
        const notionStatusText = document.getElementById('notionStatusText');
        const notionProgress = document.getElementById('notionProgress');
        const notionProgressBar = document.getElementById('notionProgressBar');
        
        // 打开 Notion 配置弹窗
        function showNotionConfigModal() {
            notionConfigModal.style.display = 'flex';
        }
        
        // 关闭 Notion 配置弹窗
        async function closeNotionConfigModalFunc() {
            notionConfigModal.style.display = 'none';
            // 关闭弹窗后刷新列表
            try {
                allHistory = await loadHistory();
                filteredHistory = allHistory;
                await displayHistory(filteredHistory);
            } catch (error) {
                console.error('刷新列表失败:', error);
            }
        }
        
        // 事件监听器
        notionConfigBtn.addEventListener('click', showNotionConfigModal);
        closeNotionConfigModal.addEventListener('click', closeNotionConfigModalFunc);
        cancelNotionConfigBtn.addEventListener('click', closeNotionConfigModalFunc);
        
        // 点击弹窗背景关闭弹窗
        notionConfigModal.addEventListener('click', (e) => {
            if (e.target.id === 'notionConfigModal') {
                closeNotionConfigModalFunc();
            }
        });
        
        let notionConfig = {
            apiKey: '',
            databaseId: '',
            isConfigured: false
        };
        
        // 加载保存的配置
        async function loadNotionConfig() {
            try {
                const result = await chrome.storage.local.get(['notionConfig']);
                if (result.notionConfig) {
                    notionConfig = result.notionConfig;
                    notionApiKey.value = notionConfig.apiKey || '';
                    notionDatabaseId.value = notionConfig.databaseId || '';
                    
                    if (notionConfig.isConfigured) {
                        updateNotionStatus('idle', '✅', '已配置');
                        syncToNotionBtn.disabled = false;
                    }
                }
            } catch (error) {
                console.error('加载 Notion 配置失败:', error);
            }
        }
        
        // 保存配置
        async function saveNotionConfig() {
            const apiKey = notionApiKey.value.trim();
            const databaseId = notionDatabaseId.value.trim();
            
            if (!apiKey || !databaseId) {
                updateNotionStatus('error', '❌', '请填写完整的配置信息');
                return;
            }
            
            try {
                updateNotionStatus('syncing', '⏳', '验证配置中...');
                
                // 验证配置是否有效
                const isValid = await validateNotionConfig(apiKey, databaseId);
                
                if (isValid) {
                    notionConfig = {
                        apiKey: apiKey,
                        databaseId: databaseId,
                        isConfigured: true
                    };
                    
                    await chrome.storage.local.set({ notionConfig: notionConfig });
                    updateNotionStatus('success', '✅', '配置保存成功');
                    syncToNotionBtn.disabled = false;
                    
                    // 保存成功后关闭弹窗
                    closeNotionConfigModalFunc();
                } else {
                    updateNotionStatus('error', '❌', '配置验证失败，请检查 API 密钥和数据库 ID');
                }
            } catch (error) {
                console.error('保存 Notion 配置失败:', error);
                updateNotionStatus('error', '❌', '保存配置失败: ' + error.message);
            }
        }
        
        // 验证 Notion 配置
        async function validateNotionConfig(apiKey, databaseId) {
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'notionApiRequest',
                    method: 'GET',
                    url: `https://api.notion.com/v1/databases/${databaseId}`,
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2022-06-28',
                        'Content-Type': 'application/json'
                    }
                });
                
                return response.success;
            } catch (error) {
                console.error('验证 Notion 配置失败:', error);
                return false;
            }
        }
        
        // 同步历史记录到 Notion
        async function syncHistoryToNotion() {
            if (!notionConfig.isConfigured) {
                updateNotionStatus('error', '❌', '请先配置 Notion 信息');
                return;
            }
            
            try {
                updateNotionStatus('syncing', '🔄', '正在同步到 Notion...');
                showNotionProgress(true);
                
                const history = await loadHistory();
                if (history.length === 0) {
                    updateNotionStatus('idle', '✅', '没有需要同步的记录');
                    showNotionProgress(false);
                    return;
                }
                
                // 获取已同步的记录
                const syncedRecords = await getSyncedRecords();
                
                // 过滤出未同步的记录
                const unsyncedHistory = history.filter(item => 
                    !syncedRecords.includes(item.filename || item.timestamp.toString())
                );
                
                if (unsyncedHistory.length === 0) {
                    updateNotionStatus('success', '✅', '所有记录已同步');
                    showNotionProgress(false);
                    return;
                }
                
                let syncedCount = 0;
                const totalCount = unsyncedHistory.length;
                
                updateNotionStatus('syncing', '🔄', `发现 ${totalCount} 条新记录需要同步`);
                
                for (let i = 0; i < unsyncedHistory.length; i++) {
                    const item = unsyncedHistory[i];
                    
                    try {
                        await createNotionPage(item);
                        syncedCount++;
                        
                        // 记录已同步的项目
                        await markAsSynced(item.filename || item.timestamp.toString());
                        
                        // 更新进度
                        const progress = (syncedCount / totalCount) * 100;
                        updateNotionProgress(progress);
                        updateNotionStatus('syncing', '🔄', `同步中... (${syncedCount}/${totalCount})`);
                        
                        // 避免请求过于频繁
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (error) {
                        console.error('同步单个记录失败:', error);
                        // 继续同步其他记录
                    }
                }
                
                updateNotionStatus('success', '✅', `同步完成 (${syncedCount}/${totalCount})`);
                showNotionProgress(false);
                
            } catch (error) {
                console.error('同步到 Notion 失败:', error);
                updateNotionStatus('error', '❌', '同步失败: ' + error.message);
                showNotionProgress(false);
            }
        }
        
        // 创建 Notion 页面
        async function createNotionPage(historyItem) {
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
                        files: await getThumbnailFile(historyItem.thumbnail, notionConfig.apiKey)
                    },
                    'FilePath': {
                        rich_text: [{
                            text: {
                                content: await getFilePathForItem(historyItem) || ''
                            }
                        }]
                    },
                    'FilepathReal': {
                        files: await getFilepathRealFile(historyItem, notionConfig.apiKey)
                    }
                }
            };
            
            const response = await chrome.runtime.sendMessage({
                action: 'notionApiRequest',
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
        
        // 获取截图类型文本
        function getScreenshotTypeText(type) {
            switch (type) {
                case 'normal': return '普通截图';
                case 'full': return '长截图';
                case 'area': return '区域截图';
                default: return '未知类型';
            }
        }
        
        // 获取文件的 file:// 路径
        async function getFilePathForItem(historyItem) {
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
        
        // 获取缩略图文件
        async function getThumbnailFile(thumbnailBase64, notionToken) {
            try {
                if (!thumbnailBase64 || !notionToken) {
                    return [];
                }
                
                // 上传图片到 Notion
                const uploadResult = await chrome.runtime.sendMessage({
                    action: 'uploadImageToNotion',
                    base64Data: thumbnailBase64,
                    notionToken: notionToken
                });
                
                if (uploadResult.success && uploadResult.data) {
                    // 返回 Notion files 属性格式
                    return [{
                        name: 'thumbnail.png',
                        type: 'file_upload',
                        file_upload: {
                            id: uploadResult.data.file_upload.id
                        }
                    }];
                }
                
                return [];
            } catch (error) {
                console.error('获取缩略图文件失败:', error);
                return [];
            }
        }
        
        // 获取实际文件并上传到 Notion
        async function getFilepathRealFile(historyItem, notionToken) {
            try {
                if (!historyItem.filename || !notionToken) {
                    return [];
                }
                
                // 获取文件的完整路径
                const downloadPath = await getDownloadPath();
                const pathSeparator = navigator.platform.includes('Win') ? '\\' : '/';
                const fullPath = `${downloadPath}${pathSeparator}webSnap${pathSeparator}${historyItem.filename}`;
                
                // 上传文件到 Notion
                const uploadResult = await chrome.runtime.sendMessage({
                    action: 'uploadFileToNotion',
                    filePath: fullPath,
                    notionToken: notionToken
                });
                
                if (uploadResult.success && uploadResult.data) {
                    // 返回 Notion files 属性格式
                    return [{
                        name: historyItem.filename,
                        type: 'file_upload',
                        file_upload: {
                            id: uploadResult.data.file_upload.id
                        }
                    }];
                }
                
                return [];
            } catch (error) {
                console.error('获取实际文件失败:', error);
                return [];
            }
        }
        
        // 更新 Notion 状态
        function updateNotionStatus(status, icon, text) {
            notionStatus.className = `notion-status ${status}`;
            notionStatusIcon.textContent = icon;
            notionStatusText.textContent = text;
        }
        
        // 显示/隐藏进度条
        function showNotionProgress(show) {
            notionProgress.style.display = show ? 'block' : 'none';
            if (!show) {
                notionProgressBar.style.width = '0%';
            }
        }
        
        // 更新进度条
        function updateNotionProgress(percentage) {
            notionProgressBar.style.width = `${percentage}%`;
        }
        
        // 获取已同步的记录
        async function getSyncedRecords() {
            try {
                const result = await chrome.storage.local.get(['syncedNotionRecords']);
                return result.syncedNotionRecords || [];
            } catch (error) {
                console.error('获取已同步记录失败:', error);
                return [];
            }
        }
        
        // 标记记录为已同步
        async function markAsSynced(recordId) {
            try {
                const syncedRecords = await getSyncedRecords();
                if (!syncedRecords.includes(recordId)) {
                    syncedRecords.push(recordId);
                    await chrome.storage.local.set({ syncedNotionRecords: syncedRecords });
                }
            } catch (error) {
                console.error('标记记录为已同步失败:', error);
            }
        }
        
        // 清除同步记录（用于重新同步）
        async function clearSyncedRecords() {
            try {
                await chrome.storage.local.remove(['syncedNotionRecords']);
                updateNotionStatus('idle', '✅', '同步记录已清除');
            } catch (error) {
                console.error('清除同步记录失败:', error);
            }
        }
        
        // 清空 Notion 配置
        async function clearNotionConfig() {
            if (confirm('确定要清空 Notion 配置吗？这将删除所有已保存的配置信息。')) {
                try {
                    // 清除配置数据
                    await chrome.storage.local.remove(['notionConfig', 'syncedNotionRecords']);
                    
                    // 重置表单
                    notionApiKey.value = '';
                    notionDatabaseId.value = '';
                    
                    // 重置配置对象
                    notionConfig = {
                        apiKey: '',
                        databaseId: '',
                        isConfigured: false
                    };
                    
                    // 更新状态
                    updateNotionStatus('idle', '⏸️', '未配置');
                    syncToNotionBtn.disabled = true;
                    
                    console.log('Notion 配置已清空');
                } catch (error) {
                    console.error('清空 Notion 配置失败:', error);
                    updateNotionStatus('error', '❌', '清空配置失败: ' + error.message);
                }
            }
        }
        
        // 事件监听器
        saveNotionConfigBtn.addEventListener('click', saveNotionConfig);
        syncToNotionBtn.addEventListener('click', syncHistoryToNotion);
        clearNotionConfigBtn.addEventListener('click', clearNotionConfig);
        
        // 双击同步按钮清除同步记录（隐藏功能）
        let syncBtnClickCount = 0;
        syncToNotionBtn.addEventListener('dblclick', function() {
            if (confirm('确定要清除所有同步记录并重新同步吗？')) {
                clearSyncedRecords();
            }
        });
        
        // 初始化时加载配置
        loadNotionConfig();
    }
    
    // 启动同步指示器
    startSyncIndicator();
    
    // 监听存储变化，更新同步指示器
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            // 如果 Notion 配置发生变化，更新同步指示器
            if (changes.notionToken || changes.notionDatabaseId) {
                updateSyncIndicator();
            }
            // 如果历史记录发生变化，更新同步指示器
            if (changes.screenshotHistory) {
                updateSyncIndicator();
            }
        }
    });
    
    console.log('历史记录页面初始化完成');
});