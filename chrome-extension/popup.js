// FlipIt popup script — opens the current tab's URL in FlipIt.
document.getElementById('openBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const targetUrl = (tab && tab.url) || '';
        const flipUrl = 'https://flipit-app.netlify.app/?url=' + encodeURIComponent(targetUrl);
        chrome.tabs.create({ url: flipUrl });
    } catch (e) {
        chrome.tabs.create({ url: 'https://flipit-app.netlify.app/' });
    }
});
