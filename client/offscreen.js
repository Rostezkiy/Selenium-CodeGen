chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === 'crop_image') {
        const { dataUrl, rect } = message;
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            // Устанавливаем размеры канваса равными области обрезки
            canvas.width = rect.width;
            canvas.height = rect.height;

            // Рисуем на канвасе только нужную часть изображения
            ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
            
            // Получаем результат в виде data URL и отправляем обратно
            sendResponse(canvas.toDataURL('image/png'));
        };

        img.onerror = () => {
            sendResponse(null); // В случае ошибки
        };

        img.src = dataUrl;
        return true; // для асинхронного sendResponse
    }
});