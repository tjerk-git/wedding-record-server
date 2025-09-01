const sections = document.querySelectorAll('section');
const promptElement = document.getElementById('prompt');
const timerElementSection1 = document.getElementById('timer_section1');
const recordTimerElement = document.getElementById('record_timer');
const intro = document.getElementById('intro');
const videoDiv = document.getElementById('video');
const cameraPreview = document.getElementById('camera_preview');
const screenshotContainer = document.getElementById('screenshot_container');
const bgElem = document.querySelector('.bg');

let currentSection = 0;

const prompts = [
    "What is your favorite movie?",
    "Tell me a joke!", 
    "Tell me a secret!", 
    "Show me your best dancemove!", 
    "Show me something weird.", 
    "What do you like about CMD?"
];

let mediaRecorder;
let recordedChunks = [];
let currentStream;
let enterDisabled = false;
let screenshotData = null;
let currentPromptText = '';
let recordingStopped = false; // Prevent double stop
// Configurable recording duration (in seconds)
const RECORDING_TIME_SECONDS = 10;

// Configurable prompts setting
const USE_PROMPTS = false;

function startCameraPreview() {
    if (!cameraPreview) return;
    
    // Clear any existing video
    cameraPreview.innerHTML = '';
    
    // Create video element for preview
    const previewVideo = document.createElement('video');
    previewVideo.setAttribute('autoplay', true);
    previewVideo.setAttribute('playsinline', true);
    previewVideo.setAttribute('muted', true);
    
    cameraPreview.appendChild(previewVideo);
    
    // Get user media for preview with Raspberry Pi-friendly settings
    navigator.mediaDevices.getUserMedia({ 
        video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 25, max: 30 }
        }, 
        audio: false 
    })
        .then(function(stream) {
            previewVideo.srcObject = stream;
            console.log('Camera preview started');
        })
        .catch(function(err) {
            console.error('Error accessing camera for preview:', err);
            cameraPreview.innerHTML = '<div style="color: white; text-align: center; padding: 2rem;">Camera not available</div>';
        });
}

function stopCameraPreview() {
    if (cameraPreview) {
        // Stop any active video streams in the preview
        const previewVideo = cameraPreview.querySelector('video');
        if (previewVideo && previewVideo.srcObject) {
            const stream = previewVideo.srcObject;
            stream.getTracks().forEach(track => track.stop());
        }
        cameraPreview.innerHTML = '';
    }
}

function startRecordingWithStream(stream) {
    // --- MediaRecorder setup ---
    recordedChunks = [];
    recordingStopped = false;

    // Find a supported MIME type
    let mimeType = '';
    // Prioritize codecs that work well on Raspberry Pi
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        mimeType = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
    } else {
        mimeType = '';
    }

    try {
        if (mimeType) {
            mediaRecorder = new MediaRecorder(stream, { 
                mimeType,
                videoBitsPerSecond: 2500000, // 2.5 Mbps for better quality/sync
                audioBitsPerSecond: 128000   // 128 kbps audio
            });
        } else {
            mediaRecorder = new MediaRecorder(stream, {
                videoBitsPerSecond: 2500000,
                audioBitsPerSecond: 128000
            });
        }
        console.log('MediaRecorder created successfully with mimeType:', mediaRecorder.mimeType);
    } catch (e) {
        console.error('Failed to create MediaRecorder:', e);
        alert('MediaRecorder could not be created: ' + e.message);
        return;
    }

    mediaRecorder.ondataavailable = function(event) {
        console.log('ondataavailable: event.data.size =', event.data.size, 'type:', event.data.type);
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
            console.log('Added chunk, total chunks:', recordedChunks.length);
        } else {
            console.warn('Received empty data chunk');
        }
    };

    mediaRecorder.onerror = function(e) {
        console.error('MediaRecorder error:', e);
    };

    mediaRecorder.onstart = function() {
        console.log('MediaRecorder started');
    };

    mediaRecorder.onstop = function() {
        if (recordingStopped) return;
        recordingStopped = true;
        console.log('MediaRecorder stopped. Total chunks:', recordedChunks.length);
        if (recordedChunks.length === 0) {
            console.error('No data was recorded!');
        } else {
            let totalSize = recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0);
            console.log('Total recorded size:', totalSize, 'bytes');
        }
        window.recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
        // Only now advance to the next step
        setTimeout(() => {
            executeStep(2);
        }, 100); // Small delay to ensure all data is flushed
    };

    // Start recording with a timeslice to force periodic dataavailable events
    // 500ms = 0.5s, so we get chunks twice per second for better sync
    try {
        mediaRecorder.start(500);
        console.log('mediaRecorder.start(500) called');
    } catch (e) {
        console.error('mediaRecorder.start failed:', e);
        alert('Recording could not be started: ' + e.message);
        return;
    }

    // Start recording timer
    startRecordingTimer();
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !enterDisabled) {
        event.preventDefault();
        handleShortEnterPress();
    }
});

function handleShortEnterPress() {
    if (enterDisabled) return;
    currentSection++;
    executeStep(currentSection);
}

function executeStep(step) {
    if (step >= sections.length) {
        step = 0;
        stopAllStreams();
        enterDisabled = false;
    }
    currentSection = step;
    updateSectionDisplay();

    switch (currentSection) {
        case 0:
            console.log("Executing Step 0: Initial/Reset Screen");
            if(videoDiv){
                videoDiv.style.display = 'none';
            }
            if(intro){
                intro.style.display = 'flex';
            }

            if (bgElem) {
                bgElem.style.opacity = '0.3';
            }

            if (promptElement) promptElement.textContent = '';
            if (timerElementSection1) timerElementSection1.textContent = '';
            if (recordTimerElement) recordTimerElement.textContent = '';
            if (screenshotContainer) screenshotContainer.innerHTML = '';
            screenshotData = null;
            currentPromptText = '';
            stopAllStreams();
            stopCameraPreview();
            startCameraPreview();
            enterDisabled = false;
            break;

        case 1:
            if (bgElem) {
                bgElem.style.opacity = '0.2';
            }
            intro.style.display = 'none';
            stopCameraPreview();
            console.log("Executing Step 1: Displaying Prompt & Starting Countdown");
            enterDisabled = true;
            
            if (USE_PROMPTS) {
                let randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
                promptElement.textContent = randomPrompt;
                currentPromptText = randomPrompt;
                promptElement.style.display = 'flex';
            } else {
                promptElement.textContent = '';
                currentPromptText = '';
                promptElement.style.display = 'none';
            }
            
            let countdown = 5;
            timerElementSection1.style.display = "flex";
            timerElementSection1.textContent =  countdown;
            if (window.countdownInterval) {
                clearInterval(window.countdownInterval);
            }
            window.countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    timerElementSection1.textContent = countdown;
                } else if (countdown === 0) {
                    timerElementSection1.textContent = "go!";
       
                    startRecording();
                    enterDisabled = true;
                } else if (countdown === -1) {
                    timerElementSection1.textContent = "";
                    timerElementSection1.style.display = "none";
                    clearInterval(window.countdownInterval);
                }
            }, 1000);
            break;

        case 2:
            console.log("Executing Step 2: Success Screen");
            stopAllStreams();
            enterDisabled = false;
            uploadMedia(currentPromptText);
            if (screenshotData) {
                uploadScreenshot(screenshotData, currentPromptText);
            }
            // Reload the video grid after a delay to ensure upload completes
            setTimeout(() => {
                loadVideoGrid();
            }, 2000);
            if (screenshotData && screenshotContainer) {
                screenshotContainer.innerHTML = '';
                const img = document.createElement('img');
                img.src = screenshotData;
                img.alt = "Screenshot of your recording start";
                img.style.maxWidth = "100%";
                img.style.height = "auto";
                img.style.display = "block";
                img.style.margin = "20px auto";
                screenshotContainer.appendChild(img);
            }
            var duration = 2000;
            var end = Date.now() + duration;
            if (typeof confetti === "function") {
                confetti({
                    particleCount: 200,
                    spread: 120,
                    origin: { y: 0.6 }
                });
                confetti({
                    particleCount: 100,
                    angle: 90,
                    spread: 70,
                    origin: { x: 0.5, y: 0 }
                });
                confetti({
                    particleCount: 100,
                    angle: 0,
                    spread: 70,
                    origin: { x: 0, y: 0.5 }
                });
                confetti({
                    particleCount: 100,
                    angle: 180,
                    spread: 70,
                    origin: { x: 1, y: 0.5 }
                });
                confetti({
                    particleCount: 100,
                    angle: 270,
                    spread: 70,
                    origin: { x: 0.5, y: 1 }
                });
            }
            setTimeout(() => {
                executeStep(0);
            }, 5000);
            break;

        default:
            console.log(`Unhandled step: ${currentSection}. Resetting.`);
            executeStep(0);
            break;
    }
}

async function uploadMedia(promptText) {
    // Defensive: If no chunks, don't upload
    if (!recordedChunks || recordedChunks.length === 0) {
        console.error('No recordedChunks to upload!');
        return;
    }
    // Use the type of the first chunk if available, fallback to webm
    let mimeType = (recordedChunks[0] && recordedChunks[0].type) ? recordedChunks[0].type : (mediaRecorder && mediaRecorder.mimeType ? mediaRecorder.mimeType : 'video/webm');
    const fileExtension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    console.log('Uploading video. Blob size:', blob.size, 'type:', blob.type, 'chunks:', recordedChunks.length);
    const formData = new FormData();
    formData.append('video', blob, `recording.${fileExtension}`);
    formData.append('prompt', promptText);

    try {
        const response = await fetch('/api/upload/video', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            console.log('Video uploaded successfully!');
        } else {
            console.error('Video upload failed:', result.message);
        }
    } catch (error) {
        console.error('Video upload failed:', error);
    }
}

async function uploadScreenshot(imageData, promptText) {
    const byteString = atob(imageData.split(',')[1]);
    const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });

    const formData = new FormData();
    formData.append('screenshot', blob, 'screenshot.png');
    formData.append('prompt', promptText);

    try {
        const response = await fetch('/api/upload/screenshot', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            console.log('Screenshot uploaded successfully!');
            loadImages();
        } else {
            console.error('Screenshot upload failed:', result.message);
        }
    } catch (error) {
        console.error('Screenshot upload failed:', error);
    }
}

function updateSectionDisplay() {
    sections.forEach((section, index) => {
        if (index === currentSection) {
            section.style.display = 'flex';
        } else {
            section.style.display = 'none';
        }
    });
}

function startRecording() {
    // Remove any previous video element
    const oldVideo = videoDiv ? videoDiv.querySelector('video:not(#playback)') : null;
    if (oldVideo) {
        oldVideo.remove();
    }

    videoDiv.style.display = 'block';

    // Create new video element for webcam
    const videoElem = document.createElement('video');
    videoElem.setAttribute('autoplay', true);
    videoElem.setAttribute('playsinline', true);
    videoElem.style.width = "100%";
    videoElem.style.height = "100%";
    videoElem.style.objectFit = "cover";
    videoElem.style.position = "absolute";
    videoElem.style.top = "0";
    videoElem.style.left = "0";
    videoElem.style.zIndex = "-1";
    videoElem.style.transform = "scaleX(-1)";

    if (videoDiv) {
        videoDiv.appendChild(videoElem);
    }

    // Get user media and start recording (video and audio)
    navigator.mediaDevices.getUserMedia({ 
        video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
            aspectRatio: { ideal: 16/9 }
        }, 
        audio: {
            sampleRate: { ideal: 48000, max: 48000 },
            channelCount: { ideal: 1, max: 1 },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    })
        .then(function(stream) {
            console.log('Got media stream:', stream);
            
            // Log stream details for debugging
            const videoTracks = stream.getVideoTracks();
            const audioTracks = stream.getAudioTracks();
            console.log('Video tracks:', videoTracks.length);
            console.log('Audio tracks:', audioTracks.length);
            
            if (videoTracks.length > 0) {
                const videoSettings = videoTracks[0].getSettings();
                console.log('Video settings:', videoSettings);
            }
            if (audioTracks.length > 0) {
                const audioSettings = audioTracks[0].getSettings();
                console.log('Audio settings:', audioSettings);
            }
            
            videoElem.srcObject = stream;
            videoElem.muted = true;
            currentStream = stream;

            // Check for audio tracks
            const hasAudio = stream.getAudioTracks().length > 0;
            if (!hasAudio) {
                console.warn('No audio tracks found in stream!');
            }

            // Take screenshot after the video stream is active
            videoElem.onloadedmetadata = () => {
                setTimeout(() => {
                    if (videoElem.videoWidth && videoElem.videoHeight) {
                        const canvas = document.createElement('canvas');
                        canvas.width = videoElem.videoWidth;
                        canvas.height = videoElem.videoHeight;
                        const context = canvas.getContext('2d');
                        context.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
                        screenshotData = canvas.toDataURL('image/png');
                        console.log('Screenshot taken after 5 seconds!');
                    } else {
                        console.warn('Video element has no dimensions yet, cannot take screenshot.');
                    }
                }, 5000);
                videoElem.onloadedmetadata = null;
            };

            // Start recording with the stream
            startRecordingWithStream(stream);
        })
        .catch(function(err) {
            console.error('Error accessing media devices:', err);
            
            // Fallback to lower quality settings for Raspberry Pi
            console.log('Trying fallback with lower quality settings...');
            navigator.mediaDevices.getUserMedia({ 
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    frameRate: { ideal: 25, max: 25 }
                }, 
                audio: {
                    sampleRate: { ideal: 44100, max: 44100 },
                    channelCount: { ideal: 1, max: 1 },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            })
            .then(function(stream) {
                console.log('Fallback stream successful');
                videoElem.srcObject = stream;
                videoElem.muted = true;
                currentStream = stream;
                
                // Continue with recording setup...
                // (rest of the recording logic would go here)
                startRecordingWithStream(stream);
            })
            .catch(function(fallbackErr) {
                console.error('Fallback also failed:', fallbackErr);
                alert('Cannot access camera/microphone: ' + fallbackErr.message);
            });
        });
}

function startRecordingTimer() {
    recordTimerElement.style.display = 'flex';
    let recordCountdown = RECORDING_TIME_SECONDS;
    recordTimerElement.textContent = recordCountdown;
    if (window.recordInterval) {
        clearInterval(window.recordInterval);
    }
    window.recordInterval = setInterval(() => {
        recordCountdown--;
        if (recordCountdown > 0) {
            recordTimerElement.textContent = recordCountdown;
        } else {
            recordTimerElement.textContent = "";
            recordTimerElement.style.display = 'none';
            clearInterval(window.recordInterval);
            // Stop recording when timer reaches 0
            if (mediaRecorder && mediaRecorder.state === "recording" && !recordingStopped) {
                console.log('Calling mediaRecorder.stop() after timer');
                mediaRecorder.stop();
                // Do NOT call executeStep(2) here; wait for onstop event!
            }
        }
    }, 1000);
}

function stopAllStreams() {
    // Stop all media streams
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    // Stop camera preview
    stopCameraPreview();
    // Clear intervals
    if (window.countdownInterval) {
        clearInterval(window.countdownInterval);
        window.countdownInterval = null;
    }
    if (window.recordInterval) {
        clearInterval(window.recordInterval);
        window.recordInterval = null;
    }
    // Stop media recorder
    if (mediaRecorder && mediaRecorder.state === "recording" && !recordingStopped) {
        console.log('Calling mediaRecorder.stop() from stopAllStreams');
        mediaRecorder.stop();
        recordingStopped = true;
    }
}

window.addEventListener('beforeunload', stopAllStreams);

function loadImages(){
     console.log('loading images');
     fetch('/api/images')
     .then(response => response.json())
     .then(data => {
         let imagesContainer = document.getElementById('images_container');
         imagesContainer.innerHTML = "";
         if (data.images && data.images.length > 0) {
             data.images.forEach((filename, index) => {
                 const img = document.createElement('img');
                 img.src = `/uploads/${filename}`;
                 img.alt = filename;
                 img.style.maxWidth = '300px';
                 img.style.maxHeight = '225px';
                 img.style.objectFit = 'cover';
                 img.style.borderRadius = '8px';
                 if (index === data.images.length - 1) {
                     img.classList.add('new-image');
                 }
                 imagesContainer.appendChild(img);
             });
         }
     })
     .catch(err => {
         document.getElementById('images_container').textContent = 'Failed to load images.';
     });
}

function loadVideoGrid() {
    fetch('/api/videos')
        .then(response => response.json())
        .then(data => {
            const videoGrid = document.getElementById('video-grid-background');
            videoGrid.innerHTML = '';
            
            const videos = data.videos || [];
            // Get the last 24 videos
            const recentVideos = videos.slice(0, 24);
            
            // Create 24 grid items (6x4)
            for (let i = 0; i < 24; i++) {
                const gridItem = document.createElement('div');
                gridItem.className = 'video-grid-item';
                
                if (recentVideos[i]) {
                    const video = document.createElement('video');
                    video.src = `/uploads/${recentVideos[i]}`;
                    video.muted = true;
                    video.autoplay = true;
                    video.loop = true;
                    video.preload = 'metadata'; // Only load metadata, not full video
                    video.style.transform = 'scale(0.8)'; // Reduce video size for better performance
                    
                    // Add random clip path mask
                    const clipPaths = [
                        'circle(40% at 50% 50%)', // Circle
                        'polygon(50% 0%, 0% 100%, 100% 100%)', // Triangle
                        'inset(5% 5% 5% 5%)', // Rectangle
                        'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)', // Parallelogram
                    ];
                    
                    const randomClip = clipPaths[i % clipPaths.length];
                    video.style.clipPath = randomClip;
                    
                    // Loop only the first 10 seconds
                    video.addEventListener('timeupdate', function() {
                        if (video.currentTime >= 10) {
                            video.currentTime = 0;
                        }
                    });
                    
                    gridItem.appendChild(video);
                }
                // If no video, just show the empty outline
                
                videoGrid.appendChild(gridItem);
            }
        })
        .catch(err => {
            console.error('Failed to load video grid:', err);
            // Still create the grid outlines even if loading fails
            const videoGrid = document.getElementById('video-grid-background');
            videoGrid.innerHTML = '';
            for (let i = 0; i < 24; i++) {
                const gridItem = document.createElement('div');
                gridItem.className = 'video-grid-item';
                videoGrid.appendChild(gridItem);
            }
        });
}

document.addEventListener('DOMContentLoaded', () => {
    executeStep(0);
    loadVideoGrid();
});