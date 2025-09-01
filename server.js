const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Define the directory for uploads
const uploadsDir = path.join(__dirname, 'uploads');
// Ensure the uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Enable CORS for all routes
app.use(cors());
// Parse JSON request bodies
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static('public'));
// Make the uploads directory available as a static folder
app.use('/uploads', express.static(uploadsDir));


// Configure Multer to use memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        // Set a file size limit of 50MB for uploads
        fileSize: 50 * 1024 * 1024
    }
});

// Serve the main HTML file for the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.post('/api/upload/video', upload.single('video'), (req, res) => {
    try {
        // Get the prompt text from the request body
        const promptText = req.body.prompt || 'no_prompt';
        // Sanitize the prompt text to be safe for filenames
        const sanitizedPrompt = promptText.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 50); // Limit length to avoid too long filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Add random string to ensure uniqueness like in screenshot endpoint
        const randomStr = Math.random().toString(36).substring(2, 8);
        // Construct the final filename including the sanitized prompt, timestamp and random string
        const finalFilename = `${sanitizedPrompt}_${timestamp}_${randomStr}.webm`;
        const filePath = path.join(uploadsDir, finalFilename);

        fs.writeFileSync(filePath, req.file.buffer);

        res.json({
            success: true,
            message: 'Video recording saved successfully',
            filename: finalFilename
        });
    } catch (error) {
        console.error('Video upload error:', error);
        res.status(500).json({ success: false, error: 'Video upload failed' });
    }
});


app.post('/api/upload/screenshot', upload.single('screenshot'), (req, res) => {
    try {
        // Get the prompt text from the request body
        const promptText = req.body.prompt || 'no_prompt';
        // Sanitize the prompt text to be safe for filenames
        const sanitizedPrompt = promptText.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 50); // Limit length
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Add random string to ensure uniqueness
        const randomStr = Math.random().toString(36).substring(2, 8);
        // Construct the final filename including the sanitized prompt, timestamp and random string
        const finalFilename = `${sanitizedPrompt}_${timestamp}_${randomStr}.png`;
        const filePath = path.join(uploadsDir, finalFilename);

        fs.writeFileSync(filePath, req.file.buffer);

        res.json({
            success: true,
            message: 'Screenshot saved successfully',
            filename: finalFilename
        });
    } catch (error) {
        console.error('Screenshot upload error:', error);
        res.status(500).json({ success: false, error: 'Screenshot upload failed' });
    }
});



app.get('/api/video/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.get('/api/images', (req, res) => {
    try {
        // Read all files in the uploads directory
        const files = fs.readdirSync(uploadsDir);
        // Filter for image files (e.g., .png, .jpg, .jpeg, .gif)
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return imageExtensions.includes(ext);
        });

        // Sort files by modification time, newest last
        const sortedImageFiles = imageFiles
            .map(file => ({
                file,
                mtime: fs.statSync(path.join(uploadsDir, file)).mtime
            }))
            .sort((a, b) => a.mtime - b.mtime) // oldest first, newest last
            .map(obj => obj.file);

        // Only return the last 9 images
        const lastEightImages = sortedImageFiles.slice(-6);

        res.json({ images: lastEightImages });
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch images' });
    }
});


app.get('/api/videos', (req, res) => {
    try {
        // Read all files in the uploads directory
        const files = fs.readdirSync(uploadsDir);
        // Filter for video files (e.g., .mp4, .webm, .mov, .avi)
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const videoFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return videoExtensions.includes(ext);
        });

        // Sort files by modification time, newest first
        const sortedVideoFiles = videoFiles
            .map(file => ({
                file,
                mtime: fs.statSync(path.join(uploadsDir, file)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime) // newest first
            .map(obj => obj.file);

        res.json({ videos: sortedVideoFiles });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch videos' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Uploads directory: ${uploadsDir}`);
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    process.exit(0);
});