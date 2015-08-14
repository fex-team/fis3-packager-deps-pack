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
