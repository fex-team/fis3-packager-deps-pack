# fis3-packager-deps-pack

**开发中**

支持包含依赖的打包插件

```
fis.match('::packager', {
  packager: fis.plugin('deps-pack', {
    
    'pkg/hello.js': [
      
      '/static/hello/src/main.js',
      '/static/hello/src/main.js:deps',
      '/static/hello/src/main.js:asyncs',
      '!/static/hello/src/comp.js:deps'
    ]

  })
});
```

* 原来的 `packTo` 将被忽视，在此插件配置项中设置。
* 每个规则都会按顺序将命中的文件加入到列表，或者从列表中移除，规则不同的顺序会带来不一样的结果。
* `:deps` 用来命中目标文件的依赖文件，不包含自己。
* `:asyncs` 用来命中目标文件的异步依赖，不包含自己。
* `!xxx` 叹号打头的规则，会把命中的文件，从现有的列表中去除。
