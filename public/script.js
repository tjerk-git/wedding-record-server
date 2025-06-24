const sections = document.querySelectorAll('section');
let currentSection = 0;


// Store references to the specific elements
const promptElement = document.getElementById('prompt');
const timerElementSection1 = document.getElementById('timer_section1'); // Unique ID for section 1 timer
const recordTimerElement = document.getElementById('record_timer'); // Assuming this is global for the recording countdown
const videoContainer = document.getElementById('video'); // Main video container


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

// Global variables for media recording
let mediaRecorder;
let recordedChunks = [];
let currentStream;
let enterDisabled = false;

// Variables for long press detection
let enterPressTimer = null;
const LONG_PRESS_THRESHOLD = 700; // milliseconds (e.g., 0.7 seconds)
let isEnterKeyHeld = false; // To prevent multiple keydown triggers for auto-repeat

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !enterDisabled && !isEnterKeyHeld) {
        isEnterKeyHeld = true; // Mark the key as held down
        event.preventDefault(); // Prevent default browser behavior (e.g., form submission)

        enterPressTimer = setTimeout(() => {
            // This code runs if it's a long press
            console.log('Long Enter press detected!');
            handleLongEnterPress();
            enterPressTimer = null; // Clear timer as action has been taken
        }, LONG_PRESS_THRESHOLD);
    }
});

document.addEventListener('keyup', function(event) {
    if (event.key === 'Enter' && isEnterKeyHeld) {
        isEnterKeyHeld = false; // Mark the key as released

        if (enterPressTimer) {
            // It was a short press if the timer is still active
            clearTimeout(enterPressTimer);
            enterPressTimer = null;
            console.log('Short Enter press detected!');
            handleShortEnterPress();
        } else {
            // If enterPressTimer is null, it means the long press action already fired
            console.log('Enter key released after long press action.');
        }
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
 * Handles the logic for a long Enter press.
 * This will typically go back a step or perform a specific action
 * based on the currentSection.
 */
function handleLongEnterPress() {
    if (enterDisabled) return;

    // Specific long press logic based on the current section
    if (currentSection === 2) { // On the review screen (section 2)
        console.log("Long press on Review Screen: Going back to prompt screen!");
        currentSection = 1; // Go back to the initial prompt screen
        stopAllStreams(); // Stop any playback or camera streams
        enterDisabled = false; // Re-enable enter
        // Clear any potentially lingering video elements from the previous recording for a clean restart
        if (videoContainer) videoContainer.innerHTML = ''; // Clear all content in video container
        window.recordedBlob = null; // Clear the recorded blob
        executeStep(currentSection); // Execute the step after modifying currentSection
    }
    // You can add more long press specific actions for other sections here
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
            // Ensure elements are cleared for a clean start
            if (promptElement) promptElement.textContent = '';
            if (timerElementSection1) timerElementSection1.textContent = '';
            if (recordTimerElement) recordTimerElement.textContent = ''; // Clear main recording timer as well

            stopAllStreams();
            enterDisabled = false;
            break;

        case 1: // Display prompt and start countdown for recording
            console.log("Executing Step 1: Displaying Prompt & Starting Countdown");

            // Use the pre-fetched element references. Add robust checks.
            if (!promptElement) {
                console.error("Prompt element is missing from the DOM for section 1.");
                return;
            }
            if (!timerElementSection1) {
                console.error("Timer element (timer_section1) is missing from the DOM for section 1.");
                return;
            }

            let randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
            promptElement.textContent = randomPrompt;

            let countdown = 3;
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
                    console.log('start recording');
                    startRecording();
                    enterDisabled = true; // Disable Enter during recording countdown and recording
                } else if (countdown === -1) {
                    timerElementSection1.textContent = "";
                    clearInterval(window.countdownInterval);
                }
            }, 1000);
            break;

        case 2: // Review screen (playback) - reached automatically after recording stops
            console.log("Executing Step 2: Review Screen (Playback)");
            // No direct action here for short press, handled by advanceToReviewScreen.
            break;

        case 3: // Success screen
            console.log("Executing Step 3: Success Screen");
            stopAllStreams();
            enterDisabled = false; // Re-enable Enter for the next cycle

            uploadVideo();

            // Replace the video with the sample video
            if (videoContainer) { // Ensure container exists
                videoContainer.innerHTML = `
                    <video src="sample.mp4" autoplay="true" loop="true" muted="true"></video>
                    <div id="timer"></div>
                    <div id="record_timer"></div>
                `;
            }

            var duration = 30 * 1000;
            var end = Date.now() + duration;
            
            (function frame() {
              // launch a few confetti from the left edge
              confetti({
                particleCount: 7,
                angle: 60,
                spread: 55,
                origin: { x: 0 }
              });
              // and launch a few from the right edge
              confetti({
                particleCount: 7,
                angle: 120,
                spread: 55,
                origin: { x: 1 }
              });
            
              // keep going until we are out of time
              if (Date.now() < end) {
                requestAnimationFrame(frame);
              }
            }());


            break;

        default:
            console.log(`Unhandled step: ${currentSection}. Resetting.`);
            executeStep(0); // Go to the initial state
            break;
    }
}

async function uploadVideo() {
    const fileExtension = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
    const formData = new FormData();
    formData.append('video', blob, `recording.${fileExtension}`);
    formData.append('filename', 'recording');
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // window.location.href = '/success.html';
        }
    } catch (error) {
        console.error('Upload failed:', error);
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
                advanceToReviewScreen(); // Automatically advance after recording stops
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

    if (!recordTimerElement) { // Ensure element exists
        console.error("Missing record_timer element. Cannot start recording timer.");
        return;
    }

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
            }
        }
    }, 1000);
}

function showPlaybackVideo() {
    console.log('showPlaybackVideo called');
    console.log('recordedBlob exists:', !!window.recordedBlob);


    if (!videoContainer) {
        console.error("Video container not found.");
        return;
    }

    let playbackVideo = videoContainer.querySelector('video#playback');
    console.log('existing playback video found:', !!playbackVideo);

    if (!playbackVideo) {
        playbackVideo = document.createElement('video');
        playbackVideo.id = 'playback';
        playbackVideo.style.width = '100%';
        playbackVideo.style.height = '100%';
        playbackVideo.style.objectFit = 'cover';
        playbackVideo.style.position = 'absolute';
        playbackVideo.style.top = '0';
        playbackVideo.style.left = '0';
        playbackVideo.style.zIndex = '2';
        playbackVideo.controls = false; // Set to false if you don't want visible controls
        playbackVideo.muted = false; // Playback with sound
        videoContainer.appendChild(playbackVideo);
        console.log('Created new playback video element');
    }

    if (window.recordedBlob) {
        const videoURL = URL.createObjectURL(window.recordedBlob);
        playbackVideo.src = videoURL;
        playbackVideo.style.display = 'block';
        console.log('Set video src to:', videoURL);

        playbackVideo.play().then(() => {
            console.log('Video playback started successfully');
        }).catch(e => {
            console.log('Autoplay prevented or failed:', e);
            // Optionally add a message to the user here to click play if autoplay fails
        });
    } else {
        console.error('No recorded blob available for playback');
    }
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

function advanceToReviewScreen() {
    console.log('advanceToReviewScreen called');
    console.log('Current section before:', currentSection);

    currentSection = 2;
    console.log('Current section after:', currentSection);

    // Hide the webcam video element
    const webcamVideo = videoContainer ? videoContainer.querySelector('video:not(#playback)') : null;
    if (webcamVideo) {
        webcamVideo.style.display = 'none';
        console.log('Hid webcam video');
    }

    // Clear the record timer
    if (recordTimerElement) { // Check if element exists
        recordTimerElement.textContent = ""; // Clear timer if it's still visible
    }

    updateSectionDisplay(); // Always update display when changing sections

    // Show the recorded video and autoplay it
    if (window.recordedBlob) {
        console.log('Recorded blob available, showing playback');
        showPlaybackVideo();
    } else {
        console.error('No recorded blob available!');
    }

    enterDisabled = false;
    console.log('Enter key re-enabled');
}

// Initialize the first step when the page loads
document.addEventListener('DOMContentLoaded', () => {
    executeStep(0);
});