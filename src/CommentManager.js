/*!
 * Comment Core Library CommentManager
 * @license MIT
 * @author Jim Chen
 *
 * Copyright (c) 2014 Jim Chen
 */
window.CommentManager = (function() {
  var _defaultComparator = function(a, b) {
    if (a.stime > b.stime) {
      return 2;
    } else if (a.stime < b.stime) {
      return -2;
    } else {
      if (a.date > b.date) {
        return 1;
      } else if (a.date < b.date) {
        return -1;
      } else if (a.dbid != null && b.dbid != null) {
        if (a.dbid > b.dbid) {
          return 1;
        } else if (a.dbid < b.dbid) {
          return -1;
        }
        return 0;
      } else {
        return 0;
      }
    }
  };

  function CommentManager(stageObject) {
    var __timer = 0;

    this._listeners = {};
    this._lastPosition = 0;

    this.stage = stageObject;
    this.options = {
      global: {
        opacity: 1,
        scale: 1,
        className: "cmt"
      },
      scroll: {
        opacity: 1,
        scale: 1
      },
      limit: 0,
      seekTrigger: 2000
    };
    this.timeline = [];
    this.runline = [];
    this.position = 0;

    this.domTips = document.createElement('div');
    this.domTips.className = 'cmt-tips';
    this.stage.appendChild(this.domTips);

    this.factory = null;
    this.filter = null;
    this.csa = {
      scroll: new CommentSpaceAllocator(0, 0),
      top: new AnchorCommentSpaceAllocator(0, 0),
      bottom: new AnchorCommentSpaceAllocator(0, 0),
      reverse: new CommentSpaceAllocator(0, 0),
      scrollbtm: new CommentSpaceAllocator(0, 0)
    };

    /** Precompute the offset width **/
    this.width = this.stage.offsetWidth;
    this.height = this.stage.offsetHeight;
    this._startTimer = function() {
      if (__timer > 0) {
        return;
      }
      var lastTPos = new Date().getTime();
      var cmMgr = this;
      __timer = window.setInterval(function() {
        var elapsed = new Date().getTime() - lastTPos;
        lastTPos = new Date().getTime();
        cmMgr.onTimerEvent(elapsed, cmMgr);
      }, 10);
    };
    this._stopTimer = function() {
      window.clearInterval(__timer);
      __timer = 0;
    };
  }

  /** Public **/
  CommentManager.prototype.stop = function() {
    this._stopTimer();
    // Send stop signal to all comments
    this.runline.forEach(function(c) { c.stop(); });
  };

  CommentManager.prototype.start = function() {
    this._startTimer();
  };

  CommentManager.prototype.hasaki = function(info) {
    this._hasaki = info;
    this._hasaki.ttl = info.duration;
  };

  CommentManager.prototype.seek = function(time) {
    this.position = BinArray.bsearch(this.timeline, time, function(a, b) {
      if (a < b.stime) {
        return -1
      } else if (a > b.stime) {
        return 1;
      } else {
        return 0;
      }
    });
  };

  CommentManager.prototype.validate = function(cmt) {
    if (cmt == null) {
      return false;
    }
    return this.filter.doValidate(cmt);
  };

  CommentManager.prototype.load = function(a) {
    this.timeline = a;
    this.timeline.sort(_defaultComparator);
    this.dispatchEvent("load");
  };

  CommentManager.prototype.insert = function(c) {
    var index = BinArray.binsert(this.timeline, c, _defaultComparator);
    if (index <= this.position) {
      this.position++;
    }
    this.dispatchEvent("insert");
  };

  CommentManager.prototype.clear = function() {
    while (this.runline.length > 0) {
      this.runline[0].finish();
    }
    this.dispatchEvent("clear");
  };

  CommentManager.prototype.setBounds = function(width, height) {
    this.width = width || this.stage.offsetWidth;
    this.height = height || this.stage.offsetHeight;
    this.dispatchEvent("resize");
    for (var comAlloc in this.csa) {
      this.csa[comAlloc].setBounds(this.width, this.height);
    }
    // Update 3d perspective
    this.stage.style.perspective = this.width / Math.tan(55 * Math.PI / 180) / 2 + "px";
    this.stage.style.webkitPerspective = this.width / Math.tan(55 * Math.PI / 180) / 2 + "px";
  };

  CommentManager.prototype.init = function(renderer) {
    this.setBounds();
    if (this.filter == null) {
      this.filter = new CommentFilter(); //Only create a filter if none exist
    }
    if (this.factory == null) {
      switch (renderer) {
        case 'legacy':
          this.factory = CommentFactory.defaultFactory();
          break;
        default:
        case 'css':
          this.factory = CommentFactory.defaultCssRenderFactory();
          break;
      }
    }
  };

  CommentManager.prototype.time = function(time) {
    time = time - 1;
    if (this.position >= this.timeline.length ||
      Math.abs(this._lastPosition - time) >= this.options.seekTrigger) {

      this.seek(time);
      this._lastPosition = time;
      if (this.timeline.length <= this.position) {
        return;
      }
    } else {
      this._lastPosition = time;
    }
    for (; this.position < this.timeline.length; this.position++) {
      if (this.timeline[this.position]['stime'] <= time) {
        if (this.options.limit > 0 && this.runline.length >= this.options.limit) {
          continue; // Skip comments but still move the position pointer
        } else if (this.validate(this.timeline[this.position])) {
          this.send(this.timeline[this.position]);
        }
      } else {
        break;
      }
    }
  };

  CommentManager.prototype.rescale = function() {
    // TODO: Implement rescaling
  };

  CommentManager.prototype.send = function(data) {
    if (data.mode === 8) {
      console.log(data);
      if (this.scripting) {
        console.log(this.scripting.eval(data.code));
      }
      return;
    }
    if (this.filter != null) {
      data = this.filter.doModify(data);
      if (data == null) {
        return;
      }
    }
    var cmt = this.factory.create(this, data);
    switch (cmt.mode) {
      default:
      case 1:
        this.csa.scroll.add(cmt);
        break;
      case 2:
        this.csa.scrollbtm.add(cmt);
        break;
      case 4:
        this.csa.bottom.add(cmt);
        break;
      case 5:
        this.csa.top.add(cmt);
        break;
      case 6:
        this.csa.reverse.add(cmt);
        break;
      case 7:
      case 17:
        /* Do NOT manage these comments! */
        break;
    }
    cmt.y = cmt.y;
    this.dispatchEvent("enterComment", cmt);
    this.runline.push(cmt);

    if (cmt.cindex > 0 && !cmt.forceShow) {
      cmt.finish();
    }
  };

  CommentManager.prototype.finish = function(cmt) {
    this.dispatchEvent("exitComment", cmt);
    this.stage.removeChild(cmt.dom);
    var index = this.runline.indexOf(cmt);
    if (index >= 0) {
      this.runline.splice(index, 1);
    }
    switch (cmt.mode) {
      default:
      case 1: {this.csa.scroll.remove(cmt);}
        break;
      case 2: {this.csa.scrollbtm.remove(cmt);}
        break;
      case 4: {this.csa.bottom.remove(cmt);}
        break;
      case 5: {this.csa.top.remove(cmt);}
        break;
      case 6: {this.csa.reverse.remove(cmt);}
        break;
      case 7:
        break;
    }
  };

  CommentManager.prototype.addEventListener = function(event, listener) {
    if (typeof this._listeners[event] !== "undefined") {
      this._listeners[event].push(listener);
    } else {
      this._listeners[event] = [listener];
    }
  };

  CommentManager.prototype.dispatchEvent = function(event, data) {
    if (typeof this._listeners[event] !== "undefined") {
      for (var i = 0; i < this._listeners[event].length; i++) {
        try {
          this._listeners[event][i](data);
        } catch (e) {
          console.err(e.stack);
        }
      }
    }
  };

  /** Static Functions **/
  CommentManager.prototype.onTimerEvent = function(timePassed, cmObj) {
    if (this._hasaki) {
      this._hasaki.ttl -= timePassed;
      var ttlRate = (this._hasaki.duration - this._hasaki.ttl) / this._hasaki.duration;
      this._hasaki.maxTtlPercent = this._hasaki.ttlPercent + (1 - this._hasaki.ttlPercent) * ttlRate;
      if (this._hasaki.ttl <= 0) {
        this._hasaki = null;
      }
    }
    for (var i = 0; i < cmObj.runline.length; i++) {
      var cmt = cmObj.runline[i];
      cmt.time(timePassed);

      var cmtTtlPercent = cmt.ttl / cmt.dur;
      if (this._hasaki && cmt.y >= this._hasaki.minTop && cmt.y <= this._hasaki.maxTop
        && cmtTtlPercent >= this._hasaki.ttlPercent && cmtTtlPercent <= this._hasaki.maxTtlPercent) {
        cmt.finish();
      }
    }
  };

  CommentManager.prototype.showTips = function(tipsObj) {
    this.domTips.innerHTML = tipsObj.tips;
    this.domTips.style.left = tipsObj.left + 'px';
    this.domTips.style.top = tipsObj.top + 'px';
    this.domTips.style.display = 'block';
  };

  CommentManager.prototype.hideTips = function() {
    this.domTips.style.display = 'none';
  };

  return CommentManager;

})();
