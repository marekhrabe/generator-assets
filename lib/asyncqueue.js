/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
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

    var events = require("events"),
        util = require("util");

    var Q = require("q");

    function AsyncQueue() {
        events.EventEmitter.call(this);
        this._pending = [];
    }

    util.inherits(AsyncQueue, events.EventEmitter);

    AsyncQueue.prototype._pending = null;

    AsyncQueue.prototype._current = null;

    AsyncQueue.prototype._isPaused = false;

    AsyncQueue.prototype.push = function (fn) {
        this._pending.push(fn);

        if (!this._current && this._pending.length === 1 && !this._isPaused) {
            this._processNext();
        }
    };

    AsyncQueue.prototype.removeAll = function () {
        this._pending.length = 0;
    };

    AsyncQueue.prototype._processNext = function () {
        if (this._pending.length === 0) {
            return;
        }
        
        var fn = this._pending.shift();

        this._current = fn()
            .fail(function (err) {
                this.emit("error", err);
            }.bind(this))
            .finally(function () {
                this._current = null;

                if (!this._isPaused) {
                    this._processNext();
                }
            }.bind(this))
            .done();
    };

    AsyncQueue.prototype.pause = function () {
        this._isPaused = true;

        if (this._current) {
            return this._current;
        } else {
            return new Q();
        }
    };

    AsyncQueue.prototype.unpause = function () {
        this._isPaused = false;

        if (!this._current) {
            this._processNext();
        }
    };

    module.exports = AsyncQueue;
}());