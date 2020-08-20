# vue-wisdom

## 本仓库的使用

* 按照学习步骤，按顺序提交 `commit`，进行注解；
* 除主干逻辑外，其他一些细节分支也会进行注解；
* 会把综合性的源码解析、知识方案，发表到 `Issues`；
* 每个月进行一次对 `vue-next` 的同步，确保即时性；

## 源码目录结构解析

得益于 Lerna 的多包管理，框架的所有内部库都在 `packages/` 目录下管理：

``` iterm
├── packages
│   ├── compiler-core // 平台无关的编译器
│   ├── compiler-dom // 浏览器平台的编译器
│   ├── compiler-sfc // 为单文件组件编译成 JS 提供工具
│   ├── compiler-ssr
│   ├── global.d.ts
│   ├── reactivity // 数据响应式系统
│   ├── runtime-core // 平台无关的运行时
│   ├── runtime-dom // 浏览器平台的运行时
│   ├── runtime-test // 提供测试用 API
│   ├── server-renderer // 用于服务端渲染
│   ├── shared // 框架内部共享的数据与方法
│   ├── size-check // 检测 Tree-Shaking 后的运行时大小
│   ├── template-explorer
│   └── vue // 用于构建，引用了 runtime 和 compiler
```

**runtime-core：**

平台无关的运行时。包含 Virtual DOM 渲染器、Vue 组件、Vue 各 API 等

**runtime-dom：**

针对浏览器平台的运行时。包括操作 DOM 节点与属性、处理 DOM 事件等

**reactivity：**

数据响应式系统。独立的库，可以与其他框架配合使用。

提供的 API 主要有：

* ref 数据容器
* reactive 基于 Proxy 实现的响应式系统
* computed 计算数据
* effect 副作用

**shared：**

框架内部共享的数据与方法。

## Status: Release Candidate

- All planned RFCs have been merged.

- All [merged RFCs](https://github.com/vuejs/rfcs/pulls?q=is%3Apr+is%3Amerged+label%3A3.x) have been implemented.

- Vue CLI now has experimental support via [vue-cli-plugin-vue-next](https://github.com/vuejs/vue-cli-plugin-vue-next).

- There is also a simple plain webpack-based setup with Single-File Component support available [here](https://github.com/vuejs/vue-next-webpack-preview).

Please note that there could still be undocumented behavior inconsistencies with 2.x. When you run into such a case, please make sure to first check if the behavior difference has already been proposed in an existing RFC. If the inconsistency is not part of an RFC, then it's likely unintended, and an issue should be opened (please make sure to use the [issue helper](https://new-issue.vuejs.org/?repo=vuejs/vue-next) when opening new issues).

In addition, the current implementation requires native ES2015+ in the runtime environment and does not support IE11 (yet). The IE11 compatible build will be worked on after we have reached RC stage.

The documentation of Vue 3 can be found at https://v3.vuejs.org/

## Status of the rest of the framework

### Vue Router

- [![alpha](https://img.shields.io/npm/v/vue-router/next.svg)](https://www.npmjs.com/package/vue-router/v/next)
- [Github](https://github.com/vuejs/vue-router-next)
- [RFCs](https://github.com/vuejs/rfcs/pulls?q=is%3Apr+is%3Amerged+label%3Arouter)

We still have a few minor router hook behavior consistency issues with `vue-router@3.x`, but these are the only things that is blocking the router from being marked as Beta. The router is usable for new, non-critical projects.

### Vuex

- [![beta](https://img.shields.io/npm/v/vuex/next.svg)](https://www.npmjs.com/package/vuex/v/next)
- [Github](https://github.com/vuejs/vuex/tree/4.0)

The only difference between Vuex 4.0 and 3.x is that it's Vue 3 compatible! It is ready to enter RC together with Vue 3 core.

### Vue CLI

As of v4.5.0, `vue-cli` now provides built-in option to choose Vue 3 preset when creating a new project.

### JSX Support

There are currently two JSX transform implementations for Vue 3 with slightly differing syntax (for Vue specific features):

- [vueComponent/jsx](https://github.com/vueComponent/jsx)
- [HcySunYang/vue-next-jsx](https://github.com/HcySunYang/vue-next-jsx)

We are using [this thread](https://github.com/vuejs/jsx/issues/141) to unify the design and land on an official specification of how Vue features should be handled in JSX. If you use Vue with JSX, please provide your feedback in that thread.

### Other Projects

| Project             | Status |
| ------------------- | ------ |
| vue-devtools        | [![alpha][vd-badge]][vd-npm] [[Github][vd-code]] |
| eslint-plugin-vue   | [![alpha][epv-badge]][epv-npm] [[Github][epv-code]] |
| @vue/test-utils     | [![alpha][vtu-badge]][vtu-npm] [[Github][vtu-code]] |
| vue-class-component | [![alpha][vcc-badge]][vcc-npm] [[Github][vcc-code]] |
| vue-loader          | [![alpha][vl-badge]][vl-npm] [[Github][vl-code]] |
| rollup-plugin-vue   | [![alpha][rpv-badge]][rpv-npm] [[Github][rpv-code]] |

[vd-badge]: https://img.shields.io/npm/v/@vue/devtools/beta.svg
[vd-npm]: https://www.npmjs.com/package/@vue/devtools/v/beta
[vd-code]: https://github.com/vuejs/vue-devtools/tree/next

[epv-badge]: https://img.shields.io/npm/v/eslint-plugin-vue/next.svg
[epv-npm]: https://www.npmjs.com/package/eslint-plugin-vue/v/next
[epv-code]: https://github.com/vuejs/eslint-plugin-vue

[vtu-badge]: https://img.shields.io/npm/v/@vue/test-utils/next.svg
[vtu-npm]: https://www.npmjs.com/package/@vue/test-utils/v/next
[vtu-code]: https://github.com/vuejs/vue-test-utils-next

[jsx-badge]: https://img.shields.io/npm/v/@ant-design-vue/babel-plugin-jsx.svg
[jsx-npm]: https://www.npmjs.com/package/@ant-design-vue/babel-plugin-jsx
[jsx-code]: https://github.com/vueComponent/jsx

[vcc-badge]: https://img.shields.io/npm/v/vue-class-component/next.svg
[vcc-npm]: https://www.npmjs.com/package/vue-class-component/v/next
[vcc-code]: https://github.com/vuejs/vue-class-component/tree/next

[vl-badge]: https://img.shields.io/npm/v/vue-loader/next.svg
[vl-npm]: https://www.npmjs.com/package/vue-loader/v/next
[vl-code]: https://github.com/vuejs/vue-loader/tree/next

[rpv-badge]: https://img.shields.io/npm/v/rollup-plugin-vue/next.svg
[rpv-npm]: https://www.npmjs.com/package/rollup-plugin-vue/v/next
[rpv-code]: https://github.com/vuejs/rollup-plugin-vue/tree/next

## Contribution

See [Contributing Guide](https://github.com/vuejs/vue-next/blob/master/.github/contributing.md).
