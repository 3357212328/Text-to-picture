document.addEventListener('DOMContentLoaded', () => {
    const messageDiv = document.getElementById('message');
    let api = null;
    let config;
    let zoomLevel = 1;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    // 显示消息
    function showMessage(text, color = 'green') {
        messageDiv.style.color = color;
        messageDiv.textContent = text;
        setTimeout(() => { messageDiv.textContent = ''; }, 3000);
    }

    // 更新历史记录
    function updateHistory(path) {
        if (!path) return;
        config.history = config.history || [];
        config.history.unshift(path);
        config.history = config.history.slice(0, 10);
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '';
        config.history.forEach((item) => {
            const li = document.createElement('li');
            li.textContent = item;
            historyList.appendChild(li);
        });
    }

    // 等待API初始化
    function waitForApi(maxAttempts = 20, interval = 300) {
        let attempts = 0;
        return new Promise((resolve, reject) => {
            const checkApi = setInterval(() => {
                if (window.pywebview?.api) {
                    clearInterval(checkApi);
                    api = window.pywebview.api;
                    console.log('API initialized successfully');
                    resolve(api);
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkApi);
                    showMessage('错误：无法初始化API，请检查Python环境或重启程序', 'red');
                    console.error('API initialization failed after max attempts');
                    reject(new Error('API not available'));
                }
                attempts++;
            }, interval);
        });
    }

    // 生成预览（不保存）
    async function generatePreview() {
        const text = document.getElementById('text-input').value;
        const format = document.getElementById('format-select').value;
        const fontSize = document.getElementById('font-size').value;
        const bgColor = document.getElementById('bg-color').value;
        const fontColor = document.getElementById('font-color').value;
        const imageWidth = document.getElementById('image-width').value;
        if (!text) return;

        try {
            const result = await api.generate_image(text, format, fontSize, bgColor, fontColor, imageWidth);
            if (!result.success) {
                showMessage(result.message, 'red');
                return;
            }
            const img = document.getElementById('preview-img');
            img.src = result.image_data;
            // 重置zoom/pan
            zoomLevel = 1;
            panX = 0;
            panY = 0;
            updateTransform(img);
        } catch (err) {
            showMessage('预览生成失败', 'red');
            console.error('Error generating preview:', err);
        }
    }

    // 更新图片transform
    function updateTransform(img) {
        img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
    }

    // 初始化
    waitForApi().then(() => {
        // 加载配置
        api.load_config().then((loadedConfig) => {
            console.log('Config loaded:', loadedConfig);
            config = loadedConfig;
            document.getElementById('format-select').value = config.default_format;
            document.getElementById('font-size').value = config.font_size || 24;
            document.getElementById('bg-color').value = config.bg_color || '#FFFFFF';
            document.getElementById('font-color').value = config.font_color || '#000000';
            document.getElementById('image-width').value = config.image_width || 800;
            if (config.theme === 'dark') {
                document.body.classList.add('dark');
            }
            updateHistory();
        }).catch((err) => {
            showMessage('加载配置失败', 'red');
            console.error('Error loading config:', err);
        });

        // 主题切换
        document.getElementById('theme-toggle').addEventListener('click', () => {
            console.log('Theme toggle clicked');
            document.body.classList.toggle('dark');
            config.theme = document.body.classList.contains('dark') ? 'dark' : 'light';
            showMessage('主题切换成功', 'green');
        });

        // 生成图片（预览 + 保存）
        document.getElementById('generate-btn').addEventListener('click', async () => {
            console.log('Generate button clicked');
            const text = document.getElementById('text-input').value;
            if (!text) {
                showMessage('请输入文本', 'red');
                return;
            }
            await generatePreview();  // 先生成预览
            const format = document.getElementById('format-select').value;

            // 保存
            const saveResult = await api.choose_save_path(`output.${format}`);
            if (!saveResult.success) {
                showMessage(saveResult.message, 'red');
                return;
            }
            const path = saveResult.path;
            if (path) {
                const previewImg = document.getElementById('preview-img');
                if (previewImg) {
                    const link = document.createElement('a');
                    link.href = previewImg.src;
                    link.download = path;
                    link.click();
                    updateHistory(path);
                    showMessage('图片保存成功', 'green');
                }
            } else {
                showMessage('未选择保存路径', 'orange');
            }
        });

        // 保存配置
        document.getElementById('save-config-btn').addEventListener('click', async () => {
            console.log('Save config button clicked');
            config.default_format = document.getElementById('format-select').value;
            config.font_size = document.getElementById('font-size').value;
            config.bg_color = document.getElementById('bg-color').value;
            config.font_color = document.getElementById('font-color').value;
            config.image_width = document.getElementById('image-width').value;
            try {
                const result = await api.save_config(config);
                showMessage(result.message, result.success ? 'green' : 'red');
            } catch (err) {
                showMessage('配置保存失败', 'red');
                console.error('Error saving config:', err);
            }
        });

        // 实时预览（输入变化时只预览，不保存）
        const previewTriggers = ['text-input', 'font-size', 'bg-color', 'font-color', 'image-width'];
        previewTriggers.forEach(id => {
            document.getElementById(id).addEventListener('input', generatePreview);
        });

        // 预览zoom/pan
        const previewContainer = document.querySelector('.zoom-pan-container');
        const previewImg = document.getElementById('preview-img');

        // Zoom with wheel
        previewContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY * -0.001;
            const newZoom = zoomLevel + delta;
            zoomLevel = Math.min(Math.max(0.5, newZoom), 5);
            updateTransform(previewImg);
        });

        // Pan with drag
        previewContainer.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
            previewContainer.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panX = e.clientX - startX;
            panY = e.clientY - startY;
            updateTransform(previewImg);
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            previewContainer.style.cursor = 'grab';
        });
    }).catch(() => {
        // API初始化失败，已显示错误消息
    });
});