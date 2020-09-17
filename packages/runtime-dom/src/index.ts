import {
  createRenderer,
  createHydrationRenderer,
  warn,
  RootRenderFunction,
  CreateAppFunction,
  Renderer,
  HydrationRenderer,
  App,
  RootHydrateFunction
} from '@vue/runtime-core'
import { nodeOps } from './nodeOps'
import { patchProp, forcePatchProp } from './patchProp'
// Importing from the compiler, will be tree-shaken in prod
import { isFunction, isString, isHTMLTag, isSVGTag, extend } from '@vue/shared'

declare module '@vue/reactivity' {
  export interface RefUnwrapBailTypes {
    // Note: if updating this, also update `types/refBail.d.ts`.
    runtimeDOMBailTypes: Node | Window
  }
}

// 渲染相关的配置，如更新属性的方法、操作 DOM 的方法
const rendererOptions = extend({ patchProp, forcePatchProp }, nodeOps)

// lazy create the renderer - this makes core renderer logic tree-shakable
// in case the user only imports reactivity utilities from Vue.
// 渲染器：服务于跨平台渲染，简单理解为包含平台渲染逻辑的 JavaScript 对象
let renderer: Renderer<Element> | HydrationRenderer

let enabledHydration = false

// 延时创建渲染器，当用户仅依赖响应式包时，让核心渲染逻辑支持 tree-shaking
function ensureRenderer() {
  return renderer || (renderer = createRenderer<Node, Element>(rendererOptions))
}

function ensureHydrationRenderer() {
  renderer = enabledHydration
    ? renderer
    : createHydrationRenderer(rendererOptions)
  enabledHydration = true
  return renderer as HydrationRenderer
}

// use explicit type casts here to avoid import() calls in rolled-up d.ts
export const render = ((...args) => {
  ensureRenderer().render(...args)
}) as RootRenderFunction<Element>

export const hydrate = ((...args) => {
  ensureHydrationRenderer().hydrate(...args)
}) as RootHydrateFunction

export const createApp = ((...args) => {
  // 创建 app 对象
  const app = ensureRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
  }

  const { mount } = app
  // 重写 mount 方法
  // Q：为什么要重写这个方法？而不把相关逻辑放在 app 对象的 mount 方法内部来实现？
  // A：不仅仅要为 Web 平台服务，目标是「支持跨平台渲染」。createApp 函数内部的 app.mount 方法是一个标准的跨平台组件渲染流程
  // 参数：containerOrSelector 可以传元素或字符串
  // 职责：
  //   1.重写 mount 以完善 Web 平台逻辑
  //   2.兼容 2.x 写法，参数支持「DOM 对象」和「选择器字符串」
  app.mount = (containerOrSelector: Element | string): any => {
    // 如果 containerOrSelector 是字符串，就要把它转为 DOM 对象，作为最终挂载的容器
    const container = normalizeContainer(containerOrSelector)
    if (!container) return
    const component = app._component
    // 如果组件对象没有定义 render 函数和 template 模板，那么取容器的 innerHTML 作为组件模板内容
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML
    }
    // clear content before mounting
    // 挂载前清空容器内容
    container.innerHTML = ''
    const proxy = mount(container) // 真正的挂载
    // DOM API Element.removeAttribute() | MDN：https://developer.mozilla.org/zh-CN/docs/Web/API/Element/removeAttribute
    container.removeAttribute('v-cloak')
    // DOM API Element.setAttribute() | MDN：https://developer.mozilla.org/zh-CN/docs/Web/API/Element/setAttribute
    container.setAttribute('data-v-app', '')
    return proxy
  }

  return app
}) as CreateAppFunction<Element>

export const createSSRApp = ((...args) => {
  const app = ensureHydrationRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
  }

  const { mount } = app
  app.mount = (containerOrSelector: Element | string): any => {
    const container = normalizeContainer(containerOrSelector)
    if (container) {
      return mount(container, true)
    }
  }

  return app
}) as CreateAppFunction<Element>

function injectNativeTagCheck(app: App) {
  // Inject `isNativeTag`
  // this is used for component name validation (dev only)
  Object.defineProperty(app.config, 'isNativeTag', {
    value: (tag: string) => isHTMLTag(tag) || isSVGTag(tag),
    writable: false
  })
}

function normalizeContainer(container: Element | string): Element | null {
  if (isString(container)) {
    const res = document.querySelector(container)
    if (__DEV__ && !res) {
      warn(`Failed to mount app: mount target selector returned null.`)
    }
    return res
  }
  return container
}

// SFC CSS utilities
export { useCssModule } from './helpers/useCssModule'
export { useCssVars } from './helpers/useCssVars'

// DOM-only components
export { Transition, TransitionProps } from './components/Transition'
export {
  TransitionGroup,
  TransitionGroupProps
} from './components/TransitionGroup'

// **Internal** DOM-only runtime directive helpers
export {
  vModelText,
  vModelCheckbox,
  vModelRadio,
  vModelSelect,
  vModelDynamic
} from './directives/vModel'
export { withModifiers, withKeys } from './directives/vOn'
export { vShow } from './directives/vShow'

// re-export everything from core
// h, Component, reactivity API, nextTick, flags & types
export * from '@vue/runtime-core'
