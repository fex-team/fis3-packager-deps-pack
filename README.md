# fis3-packager-deps-pack

支持包含依赖的打包方式。

```js
fis.match('::packager', {
  packager: fis.plugin('deps-pack', {

    'pkg/hello.js': [

      // 将 main.js 加入队列
      '/static/hello/src/main.js',

      // main.js 的所有同步依赖加入队列
      '/static/hello/src/main.js:deps',

      // 将 main.js 所以异步依赖加入队列
      '/static/hello/src/main.js:asyncs',

      // 移除 comp.js 所有同步依赖
      '!/static/hello/src/comp.js:deps'
    ],

    // 也可以从将 js 依赖中 css 命中。
    'pkg/hello.css': [
      // main.js 的所有同步依赖加入队列
      '/static/hello/src/main.js:deps',
    ]

  })
});
```

* 原来的 `packTo` 将被忽视，在此插件配置项中设置。
* 每个规则都会按顺序将命中的文件加入到列表或者从列表中移除，顺序不同会带来不一样的结果。
* `:deps` 用来命中目标文件的依赖文件，不包含自己。
* `:asyncs` 用来命中目标文件的异步依赖，不包含自己。
* `!xxx` 叹号打头的规则，会把命中的文件，从现有的列表中去除。

## 注意

同一个文件不能够打包到同一包里面，所以如果发现某个文件没有按预期打包目标文件里面，你需要分析是不是打包其他包里面了。
策略为谁先命中先生效。

## 安装

```
npm install -g fis3-packager-deps-pack
```

## 配置项

1. `useTrack` 默认 `true`。 是否将合并前的文件路径写入注释中，方便定位代码。
2. `useSourceMap` 默认为 `false`。是否开启 souremap 功能。

### 关闭输出路径信息

默认打包后输出路径信息,便于调试.形式如下

```js
/*!/components/underscore/underscore.js*/
```

可以在插件的配置中关闭路径信息输出

```js
fis.match('::package', {
  packager: fis.plugin('deps-pack', {
    useTrack : false, // 是否输出路径信息,默认为 true
    'pkg/all.js': [
       '/modules/index.jsx',
       '/modules/index.jsx:deps'
    ]
  })
})
```

### 开启 SourceMap 功能

```js
fis.match('::package', {
  packager: fis.plugin('deps-pack', {
    useSourceMap : true, // 合并后开启 SourceMap 功能。
    'pkg/all.js': [
       '/modules/index.jsx',
       '/modules/index.jsx:deps'
    ]
  })
})
```
