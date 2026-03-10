const { app } = require('electron');
const path = require('path');

// This won't work from raw node, must be from within an electron environment.
// However, I can try to guess it based on common patterns.
// Usually %APPDATA%/ProjectName
