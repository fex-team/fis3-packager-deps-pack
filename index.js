var SourceMap = require('source-map');
var rSourceMap = /(?:\/\/\#\s*sourceMappingURL[^\r\n\'\"]*|\/\*\#\s*sourceMappingURL[^\r\n\'\"]*\*\/)(?:\r?\n|$)/ig;
var path = require('path');
var _ = fis.util;

module.exports = function(ret, pack, settings, opt) {
  if (Object.keys(pack).length) {
    fis.log.warn('`packTo` or `fis-pack.json` is useless while you are using `fis3-packager-deps-packs`');
  }

  // 是否添加调试信息
  var useTrack = true;
  var useSourceMap = false;

  if (_.has(settings, 'useTrack')) {
    useTrack = settings.useTrack;
    delete settings.useTrack;
  }

  if (_.has(settings, 'useSourceMap')) {
    useSourceMap = settings.useSourceMap;
    delete settings.useSourceMap;
  }

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
    };
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
    var sourceNode = useSourceMap && new SourceMap.SourceNode();
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

      var mathes = find(pattern);
      list = _[exclude ? 'difference' : 'union'](list, mathes);
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

    filtered.forEach(function (file) {
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

        var prefix = useTrack ? ('/*!' + file.id + '*/\n') : ''; // either js or css
        if (file.isJsLike) {
          prefix = ';' + prefix;
        } else if (file.isCssLike && c) {
          c = c.replace(/@charset\s+(?:'[^']*'|"[^"]*"|\S*);?/gi, '');
        }

        if (content) prefix = '\n' + prefix;

        c = c.replace(rSourceMap, '');

        if (sourceNode) {
          sourceNode.add(prefix);

          var mapFile = getMapFile(file);
          if (mapFile) {
            var json = JSON.parse(mapFile.getContent());
            var smc = new SourceMap.SourceMapConsumer(json);

            sourceNode.add(SourceMap.SourceNode.fromStringWithSourceMap(c, smc));
          } else {
            sourceNode.add(contents2sourceNodes(c, file.subpath));
          }
        }

        content += prefix + c;

        ret.map.res[id].pkg = pid;
        requires = requires.concat(file.requires);
        requireMap[id] = true;
        has.push(id);
      }
    });

    if (has.length) {
      if (sourceNode) {
        var mapping = fis.file.wrap(pkg.dirname + '/' + pkg.filename + pkg.rExt + '.map');
        var code_map = sourceNode.toStringWithSourceMap({
          file: pkg.subpath
        });

        var generater = SourceMap.SourceMapGenerator.fromSourceMap(new SourceMap.SourceMapConsumer(code_map.map.toJSON()));
        mapping.setContent(generater.toString());

        ret.pkg[mapping.subpath] = mapping;
        content += pkg.isCssLike ? ('/*# sourceMappingURL=' + mapping.getUrl() + '*/') : ('//# sourceMappingURL=' + mapping.getUrl());
      }

      pkg.setContent(content);
      ret.pkg[pkg.subpath] = pkg;

      // collect dependencies
      var deps = [];
      requires.forEach(function (id) {
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

function getMapFile(file) {
  var derived = file.derived;
  if (!derived || !derived.length) {
    derived = file.extras && file.extras.derived;
  }

  if (derived && derived[0] && derived[0].rExt === '.map') {
    return derived[0];
  }

  return null;
}

function contents2sourceNodes(content, filename) {
  var chunks = [];
  var lineIndex = 0;
  content.replace(/.*(\r\n|\n|\r|$)/g, function(line) {
    lineIndex++;
    chunks.push(new SourceMap.SourceNode(lineIndex, 0, filename, line));
  });

  var node = new SourceMap.SourceNode(1, 0, filename, chunks);
  node.setSourceContent(filename, content);

  return node;
}
