const sections = document.querySelectorAll('section');
const promptElement = document.getElementById('prompt');
const timerElementSection1 = document.getElementById('timer_section1');
const recordTimerElement = document.getElementById('record_timer');
const videoContainer = document.getElementById('video');
// Set the video element to the specified video and play it
const videoDiv = document.getElementById('video');
const screenshotContainer = document.getElementById('screenshot_container'); // New element to display screenshot

let currentSection = 0;

const prompts = [
    "Wat zijn de eigenschappen die Marlies in Thomas het meest bewonderen in elkaar?",
    "Wat is een typische gezamenlijke hobby van Marlies en Thomas?",
    "Wie van de twee had als eerste een oogje op de ander?",
    "Waar kijken Marlies en Thomas het meest naar uit in hun huwelijk?",
    "Wat is Marlies' geheime superkracht waar Thomas dagelijks van profiteert?",
    "Wat is Thomas zijn geheime superkracht waar Marlies dagelijks van profiteert?",
    "Wat is het gekste wat Marlies & Thomas hebben meegemaakt vóór hun bruiloft?",
    "Wat is het eerste wat Marlies & Thomas zouden doen als ze per ongeluk een miljoen winnen?",
    "Als Marlies & Thomas een band zouden beginnen, hoe heet deze band en wat voor muziek maken ze?",
    "Wat is hun domste gezamenlijke aankoop ooit?",
];

let mediaRecorder;
let recordedChunks = [];
let currentStream;
let enterDisabled = false;
let screenshotData = null; // Global variable to store screenshot data
let currentPromptText = ''; // New: Global variable to store the current prompt

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !enterDisabled) {
        event.preventDefault(); // Prevent default browser behavior (e.g., form submission)
        handleShortEnterPress();
    }
});

/**
 * Handles the logic for a short Enter press.
 * Increments the currentSection and then executes the corresponding step.
 */
function handleShortEnterPress() {
    if (enterDisabled) return;
    currentSection++; // Advance for short press
    executeStep(currentSection);
}


/**
 * Executes the code associated with the given step (currentSection).
 * This function centralizes all step-by-step logic.
 * @param {number} step The current step number to execute.
 */
function executeStep(step) {
    // Ensure currentSection is within valid bounds
    if (step >= sections.length) {
        step = 0; // Reset to the first section if out of bounds
        stopAllStreams();
        enterDisabled = false;
    }
    currentSection = step; // Update global currentSection

    // Always update section display BEFORE trying to access elements within the section
    updateSectionDisplay();

    switch (currentSection) {
        case 0: // Initial screen or reset
            console.log("Executing Step 0: Initial/Reset Screen");

            if (videoDiv) {
                videoDiv.innerHTML = '<video id="intro_video" src="babbelbox_3_goeie.mov" autoplay loop muted></video>';
                const videoEl = videoDiv.querySelector('video');
                if (videoEl) {
                    videoEl.play().catch(() => {}); // In case autoplay is blocked, try to play
                }
            }
            // Ensure elements are cleared for a clean start
            if (promptElement) promptElement.textContent = '';
            if (timerElementSection1) timerElementSection1.textContent = '';
            if (recordTimerElement) recordTimerElement.textContent = ''; // Clear main recording timer as well
            if (screenshotContainer) screenshotContainer.innerHTML = ''; // Clear previous screenshot
            screenshotData = null; // Clear screenshot data on reset
            currentPromptText = ''; // New: Clear current prompt text on reset

            stopAllStreams();
            enterDisabled = false;
            break;

        case 1: // Display prompt and start countdown for recording
            console.log("Executing Step 1: Displaying Prompt & Starting Countdown");
            enterDisabled = true;

            if (videoDiv) {
                videoDiv.style.display = 'none';
            }

            let randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
            promptElement.textContent = randomPrompt;
            currentPromptText = randomPrompt; // New: Store the current prompt

            let countdown = 5;
            timerElementSection1.textContent = countdown; // Use the specific timer for section 1

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
                    enterDisabled = true; // Disable Enter during recording countdown and recording
                } else if (countdown === -1) {
                    timerElementSection1.textContent = "";
                    clearInterval(window.countdownInterval);
                }
            }, 1000);
            break;

        case 2: // Success screen with confetti and screenshot
            console.log("Executing Step 2: Success Screen");
            stopAllStreams();
            enterDisabled = false;

            // Upload the video, passing the current prompt text
            uploadMedia(currentPromptText); // Modified: Pass currentPromptText

            // Upload the screenshot if available, passing the current prompt text
            if (screenshotData) {
                uploadScreenshot(screenshotData, currentPromptText); // Modified: Pass currentPromptText
            }

            // Display the screenshot if available
            if (screenshotData && screenshotContainer) {
                screenshotContainer.innerHTML = ''; // Clear existing content
                const img = document.createElement('img');
                img.src = screenshotData;
                img.alt = "Screenshot of your recording start";
                img.style.maxWidth = "100%";
                img.style.height = "auto";
                img.style.display = "block";
                img.style.margin = "20px auto";
                screenshotContainer.appendChild(img);
            }

            // Confetti animation
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
            executeStep(0); // Go to the initial state
            break;
    }
}

/**
 * Uploads the recorded video to the server.
 * @param {string} promptText The text of the prompt displayed to the user.
 */
async function uploadMedia(promptText) { // Modified: Added promptText parameter
    const fileExtension = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
    const formData = new FormData();
    formData.append('video', blob, `recording.${fileExtension}`);
    formData.append('prompt', promptText); // New: Append the prompt text

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

/**
 * Uploads the screenshot to the server.
 * @param {string} imageData The base64 encoded image data URL.
 * @param {string} promptText The text of the prompt displayed to the user.
 */
async function uploadScreenshot(imageData, promptText) { // Modified: Added promptText parameter
    // Convert base64 data URL to a Blob
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
    formData.append('prompt', promptText); // New: Append the prompt text

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
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    });
}

function startRecording() {
    // Remove any previous video element
    const oldVideo = videoContainer ? videoContainer.querySelector('video:not(#playback)') : null;
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

    if (videoContainer) { // Ensure videoContainer exists before appending
        videoContainer.appendChild(videoElem);
    }

    // Get user media and start recording (video only, no audio)
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(function(stream) {
            console.log('Got media stream:', stream);
            videoElem.srcObject = stream;
            videoElem.muted = true; // Mute the LIVE preview (webcam)

            currentStream = stream;

            // Take screenshot after the video stream is active
            videoElem.onloadedmetadata = () => {
                setTimeout(() => {
                    if (videoElem.videoWidth && videoElem.videoHeight) {
                        const canvas = document.createElement('canvas');
                        canvas.width = videoElem.videoWidth;
                        canvas.height = videoElem.videoHeight;
                        const context = canvas.getContext('2d');
                        context.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
                        screenshotData = canvas.toDataURL('image/png'); // Store the screenshot
                        console.log('Screenshot taken after 5 seconds!');
                    } else {
                        console.warn('Video element has no dimensions yet, cannot take screenshot.');
                    }
                }, 5000); // 10 seconds in milliseconds
                videoElem.onloadedmetadata = null; // Remove the event listener
            };


            // Check MediaRecorder support
            if (!MediaRecorder.isTypeSupported('video/webm')) {
                console.warn('video/webm not supported, trying video/mp4');
            }

            // Setup MediaRecorder
            recordedChunks = [];
            try {
                mediaRecorder = new MediaRecorder(stream);
                console.log('MediaRecorder created successfully');
            } catch (e) {
                console.error('Failed to create MediaRecorder:', e);
                return;
            }

            mediaRecorder.ondataavailable = function(event) {
                console.log('Data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                    console.log('Added chunk, total chunks:', recordedChunks.length);
                } else {
                    console.warn('Received empty data chunk');
                }
            };

            mediaRecorder.onstop = function() {
                window.recordedBlob = new Blob(recordedChunks, { type: 'video/webm' });
                console.log('Recording stopped, blob created');
                // The advanceToReviewScreen is now handled by the timer reaching 0 in startRecordingTimer
            };

            // Start recording
            mediaRecorder.start();

            // Start recording timer
            startRecordingTimer();
        })
        .catch(function(err) {
            console.error('Error accessing media devices:', err);
            alert('Kan geen toegang krijgen tot camera/microfoon: ' + err.message);
        });
}

function startRecordingTimer() {
    let recordCountdown = 10;

    recordTimerElement.textContent = recordCountdown;

    // Clear any existing recording interval
    if (window.recordInterval) {
        clearInterval(window.recordInterval);
    }

    window.recordInterval = setInterval(() => {
        recordCountdown--;
        if (recordCountdown > 0) {
            recordTimerElement.textContent = recordCountdown;
        } else {
            recordTimerElement.textContent = "";
            clearInterval(window.recordInterval);

            // Stop recording when timer reaches 0
            if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
                executeStep(2); // Advance to the success screen here
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
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
}

// Cleanup when page is closed/refreshed
window.addEventListener('beforeunload', stopAllStreams);


function loadImages(){

     console.log('loading images');
     // Fetch all screenshots from /api/images and display them
     fetch('/api/images')
     .then(response => response.json())
     .then(data => {
         let imagesContainer = document.getElementById('images_container');
         imagesContainer.innerHTML = "";
         if (data.images && data.images.length > 0) {
             data.images.forEach(filename => {
                 // Only show screenshots (pngs) if you want, or show all images
                 const img = document.createElement('img');
                 img.src = `/uploads/${filename}`;
                 img.alt = filename;
                 img.style.maxWidth = '200px';
                 img.style.maxHeight = '150px';
                 img.style.objectFit = 'cover';
                 img.style.borderRadius = '8px';
                 imagesContainer.appendChild(img);
             });
         } else {
             imagesContainer.textContent = 'No screenshots found.';
         }
     })
     .catch(err => {
         document.getElementById('images_container').textContent = 'Failed to load images.';
     });
}

// Initialize the first step when the page loads
document.addEventListener('DOMContentLoaded', () => {
    executeStep(0);
    loadImages();
});