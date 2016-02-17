var path = require('path');
var _ = fis.util;

module.exports = function(ret, pack, settings, opt) {
  // 忽略 packTo 信息，直接从 settings 中读取。
  pack = settings;

  var src = ret.src;
  var sources = [];
  var packed = {}; // cache all packed resource.
  var ns = fis.config.get('namespace');
  var connector = fis.config.get('namespaceConnector', ':');
  var root = fis.project.getProjectPath();

  // 生成数组
  Object.keys(src).forEach(function(key) {
    sources.push(src[key]);
  });

  var getDeps = (function(src, ids) {
    // 2016-02-17
    // 由于使用递归函数方式, 出现堆栈错误, 所以修改成了 while 逻辑.
    return function (file, async) {
      var list = [];
      var pending = [{file: file, async: async}];
      var collected = [];
      var asyncCollected = [];

      while (pending.length) {
        var current = pending.shift();
        var cf = current.file;
        var ca = current.async;
        var includeAsync = current.includeAsync;

        if (cf.requires && cf.requires.length && !~collected.indexOf(cf)) {
          collected.push(cf);
          cf.requires.forEach(function(id) {
            if (!ids[id])return;

            ca || ~list.indexOf(ids[id]) || list.push(ids[id]);

            pending.push({
              file: ids[id],
              async: ca
            });
          });
        }

        if ((ca || includeAsync) && file.asyncs && file.asyncs.length && !~asyncCollected.indexOf(cf)) {
          asyncCollected.push(cf);
          cf.asyncs.forEach(function(id) {
            if (!ids[id])return;

            ~list.indexOf(ids[id]) || list.push(ids[id]);

            pending.push({
              file: ids[id],
              async: false,
              includeAsync: true
            });
          });
        }
      }

      return list;
      //console.log('\n', file.subpath, '\n', list.map(function(file) {
      //  return file.subpath
      //}));
      //process.exit(1);
    };

    //return function(file, async, includeAsync) {
    //  var fn = arguments.callee;
    //  var key = async ? 'asyncs' : 'deps';
    //  if (cache[file.subpath] && cache[file.subpath][key]) {
    //    return cache[file.subpath][key];
    //  }
    //
    //  var list = [];
    //  cache[file.subpath] = cache[file.subpath] || {};
    //  cache[file.subpath][key] = list;
    //
    //  if (file.requires && file.requires.length) {
    //    file.requires.forEach(function(id) {
    //      if (ids[id]) {
    //
    //        // 同步依赖时才加入列表
    //        async || list.push(ids[id]);
    //        list.push.apply(list, fn(ids[id], async));
    //      }
    //    });
    //  }
    //
    //  if ((async || includeAsync) && file.asyncs && file.asyncs.length) {
    //    file.asyncs.forEach(function(id) {
    //      if (ids[id]) {
    //        list.push(ids[id]);
    //        list.push.apply(list, fn(ids[id], false, true));
    //      }
    //    });
    //  }
    //
    //  return list;
    //};
  })(src, ret.ids);

  function find(reg, rExt) {
    var pseudo, result;

    if (src[reg]) {
      return [src[reg]];
    } else if (reg === '**') {
      // do nothing
    } else if (typeof reg === 'string') {
      if (/^(.*):(.+)$/.test(reg)) {
        pseudo = RegExp.$2;
        reg = RegExp.$1 || '**';
      }

      reg = _.glob(reg);
    }

    result = sources.filter(function(file) {
      reg.lastIndex = 0;
      return (reg === '**' || reg.test(file.subpath)) && (!rExt || file.rExt === rExt);
    });

    if (pseudo) {
      var base = result;
      result = [];

      if (pseudo === 'deps' || pseudo === 'asyncs') {
        base.forEach(function(file) {
          result.push.apply(result, getDeps(file, pseudo === 'asyncs'));
        });
      } else {
        fis.log.error('The pseudo class `%s` is not supported.', pseudo);
      }
    }

    return result;
  }

  Object.keys(pack).forEach(function(subpath, index) {
    var patterns = pack[subpath];

    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }

    var pid = (ns ? ns + connector : '') + 'p' + index;
    var pkg = fis.file.wrap(path.join(root, subpath));

    if (typeof ret.src[pkg.subpath] !== 'undefined') {
      fis.log.warning('there is a namesake file of package [' + subpath + ']');
    }

    var list = [];

    patterns.forEach(function(pattern, index) {
      var exclude = typeof pattern === 'string' && pattern.substring(0, 1) === '!';

      if (exclude) {
        pattern = pattern.substring(1);

        // 如果第一个规则就是排除用法，都没有获取结果就排除，这是不合理的用法。
        // 不过为了保证程序的正确性，在排除之前，通过 `**` 先把所有文件获取到。
        // 至于性能问题，请用户使用时规避。
        index === 0 && (list = find('**'));
      }

      var mathes = find(pattern, pkg.rExt);
      list = _[exclude ? 'difference' : 'union'](list, mathes);
    });

    // 根据 packOrder 排序
    list = list.sort(function(a, b) {
      var a1 = a.packOrder >> 0;
      var b1 = b.packOrder >> 0;

      if (a1 === b1) {
        return list.indexOf(a) - list.indexOf(b);
      }

      return a1 - b1;
    });

    // sort by dependency
    var filtered = [];
    while (list.length) {
      add(list.shift());
    }

    function add(file) {
      if (file.requires) {
        file.requires.forEach(function(id) {
          var dep = ret.ids[id];
          var idx;
          if(dep && dep.rExt === pkg.rExt && ~(idx = list.indexOf(dep))){
            add(list.splice(idx, 1)[0]);
          }
        })
      }

      if (!packed[file.subpath] && file.rExt === pkg.rExt) {
        packed[file.subpath] = true;
        filtered.push(file);
      }
    }

    var content = '';
    var has = [];
    var requires = [];
    var requireMap = {};

    filtered.forEach(function(file) {
      var id = file.getId();

      if (ret.map.res[id]) {
        var c = file.getContent();

        // 派送事件
        var message = {
          file: file,
          content: c,
          pkg: pkg
        };
        fis.emit('pack:file', message);
        c = message.content;

        if (c) {
          content += content ? '\n' : '';

          if (file.isJsLike) {
            content += ';';
          } else if (file.isCssLike) {
            c = c.replace(/@charset\s+(?:'[^']*'|"[^"]*"|\S*);?/gi, '');
          }

          content += '/*!' + file.subpath + '*/\n' + c;
        }

        ret.map.res[id].pkg = pid;
        requires = requires.concat(file.requires);
        requireMap[id] = true;
        has.push(id);
      }
    });

    if (has.length) {
      pkg.setContent(content);
      ret.pkg[pkg.subpath] = pkg;

      // collect dependencies
      var deps = [];
      requires.forEach(function(id) {
        if (!requireMap[id]) {
          deps.push(id);
          requireMap[id] = true;
        }
      });
      var pkgInfo = ret.map.pkg[pid] = {
        uri: pkg.getUrl(opt.hash, opt.domain),
        type: pkg.rExt.replace(/^\./, ''),
        has: has
      };
      if (deps.length) {
        pkgInfo.deps = deps;
      }
    }
  });
};
