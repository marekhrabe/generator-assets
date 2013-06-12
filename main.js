/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

(function () {
    "use strict";

    var fs = require("fs"),
        resolve = require("path").resolve,
        mkdirp = require("mkdirp"),
        temp = require("temp"),
        Q = require("q"),
        convert = require("./lib/convert"),
        xpm2png = require("./lib/xpm2png");

    var assetGenerationDir = null;
    var latestRequestIdPerPath = {};

    function getUserHomeDirectory() {
        return process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"];
    }

    var _generator = null;

    function savePixmap(pixmap, filename) {
        var deferred = Q.defer();

        _generator.publish("assets.debug.dump", "dumping " + filename);

        var args = ["-", "-size", pixmap.width + "x" + pixmap.height, "png:-"];
        var proc = convert(args, _generator._photoshop._applicationPath);
        var fileStream = fs.createWriteStream(filename);
        var stderr = "";

        proc.stderr.on("data", function (chunk) { stderr += chunk; });
        proc.stdout.on("close", function () {
            deferred.resolve(filename);
        });
        
        xpm2png(pixmap, proc.stdin.end.bind(proc.stdin));
        proc.stdout.pipe(fileStream);
        
        proc.stderr.on("close", function () {
            if (stderr) {
                var error = "error from ImageMagick: " + stderr;
                _generator.publish("assets.error.convert", error);
                deferred.reject(error);
            }
        });
        
        return deferred.promise;
    }

    function handleImageChanged(message) {
        console.log("Image changed", JSON.stringify(message, null, "\t"));
        if (message.documentID && message.layerEvents) {
            message.layerEvents.forEach(function (e) {
                console.log("Layer change", e);
                handleImageChangedForLayer(message, e.layerID);
            });
        }
    }

    function handleImageChangedForLayer(message, layerID) {
        console.log("Updating layer " + layerID);
        _generator.getPixmap(layerID, 100).then(
            function (pixmap) {
                if (assetGenerationDir) {
                    var fileName = message.documentID + "-" + layerID + ".png",
                        path     = resolve(assetGenerationDir, fileName),
                        tmpPath  = temp.path({ suffix: ".png" });

                    // First time this path is used
                    if (!latestRequestIdPerPath[path]) {
                        latestRequestIdPerPath[path] = 0;
                    }
                    // Increment and store the current request ID
                    var requestId = ++latestRequestIdPerPath[path];

                    // Prevent an error after deleting a layer's contents, resulting in a 0x0 pixmap
                    if (pixmap.width === 0 || pixmap.height === 0) {
                        // Delete the image for the empty layer
                        fs.unlink(path);
                    }
                    else {
                        // Save the image in a temporary file
                        savePixmap(pixmap, tmpPath)
                            // When ImageMagick is done
                            .done(function () {
                                // If no other conversion has been started in the meantime...
                                if (requestId === latestRequestIdPerPath[path]) {
                                    // ...move the temporary file to the desired location
                                    fs.rename(tmpPath, path);
                                }
                            });
                    }

                }
            }, function (err) {
                _generator.publish("assets.error.getPixmap", "Error: " + err);
            });
    }


    function init(generator) {
        _generator = generator;
        _generator.subscribe("photoshop.event.imageChanged", handleImageChanged);

        // create a place to save assets
        var homeDir = getUserHomeDirectory();
        if (homeDir) {
            var newDir = resolve(homeDir, "Desktop", "generator-assets");
            mkdirp(newDir, function (err) {
                if (err) {
                    _generator.publish(
                        "assets.error.init",
                        "Could not create directory '" + newDir + "', no assets will be dumped"
                    );
                } else {
                    assetGenerationDir = newDir;
                }
            });
        } else {
            _generator.publish(
                "assets.error.init",
                "Could not locate home directory in env vars, no assets will be dumped"
            );
        }
    }

    exports.init = init;

}());