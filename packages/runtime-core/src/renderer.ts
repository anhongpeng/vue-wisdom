import {
  Text,
  Fragment,
  Comment,
  cloneIfMounted,
  normalizeVNode,
  VNode,
  VNodeArrayChildren,
  createVNode,
  isSameVNodeType,
  Static,
  VNodeNormalizedRef,
  VNodeHook
} from './vnode'
import {
  ComponentInternalInstance,
  createComponentInstance,
  Data,
  setupComponent
} from './component'
import {
  renderComponentRoot,
  shouldUpdateComponent,
  updateHOCHostEl
} from './componentRenderUtils'
import {
  isString,
  EMPTY_OBJ,
  EMPTY_ARR,
  isReservedProp,
  isFunction,
  PatchFlags,
  ShapeFlags,
  NOOP,
  hasOwn,
  invokeArrayFns,
  isArray
} from '@vue/shared'
import {
  queueJob,
  queuePostFlushCb,
  flushPostFlushCbs,
  invalidateJob,
  flushPreFlushCbs,
  SchedulerJob,
  SchedulerCb
} from './scheduler'
import { effect, stop, ReactiveEffectOptions, isRef } from '@vue/reactivity'
import { updateProps } from './componentProps'
import { updateSlots } from './componentSlots'
import { pushWarningContext, popWarningContext, warn } from './warning'
import { createAppAPI, CreateAppFunction } from './apiCreateApp'
import {
  SuspenseBoundary,
  queueEffectWithSuspense,
  SuspenseImpl
} from './components/Suspense'
import { TeleportImpl, TeleportVNode } from './components/Teleport'
import { isKeepAlive, KeepAliveContext } from './components/KeepAlive'
import { registerHMR, unregisterHMR, isHmrUpdating } from './hmr'
import {
  ErrorCodes,
  callWithErrorHandling,
  callWithAsyncErrorHandling
} from './errorHandling'
import { createHydrationFunctions, RootHydrateFunction } from './hydration'
import { invokeDirectiveHook } from './directives'
import { startMeasure, endMeasure } from './profiling'
import { ComponentPublicInstance } from './componentProxy'
import { devtoolsComponentRemoved, devtoolsComponentUpdated } from './devtools'
import { initFeatureFlags } from './featureFlags'

export interface Renderer<HostElement = RendererElement> {
  render: RootRenderFunction<HostElement>
  createApp: CreateAppFunction<HostElement>
}

export interface HydrationRenderer extends Renderer<Element> {
  hydrate: RootHydrateFunction
}

export type RootRenderFunction<HostElement = RendererElement> = (
  vnode: VNode | null,
  container: HostElement
) => void

export interface RendererOptions<
  HostNode = RendererNode,
  HostElement = RendererElement
> {
  patchProp(
    el: HostElement,
    key: string,
    prevValue: any,
    nextValue: any,
    isSVG?: boolean,
    prevChildren?: VNode<HostNode, HostElement>[],
    parentComponent?: ComponentInternalInstance | null,
    parentSuspense?: SuspenseBoundary | null,
    unmountChildren?: UnmountChildrenFn
  ): void
  forcePatchProp?(el: HostElement, key: string): boolean
  insert(el: HostNode, parent: HostElement, anchor?: HostNode | null): void
  remove(el: HostNode): void
  createElement(
    type: string,
    isSVG?: boolean,
    isCustomizedBuiltIn?: string
  ): HostElement
  createText(text: string): HostNode
  createComment(text: string): HostNode
  setText(node: HostNode, text: string): void
  setElementText(node: HostElement, text: string): void
  parentNode(node: HostNode): HostElement | null
  nextSibling(node: HostNode): HostNode | null
  querySelector?(selector: string): HostElement | null
  setScopeId?(el: HostElement, id: string): void
  cloneNode?(node: HostNode): HostNode
  insertStaticContent?(
    content: string,
    parent: HostElement,
    anchor: HostNode | null,
    isSVG: boolean
  ): HostElement[]
}

// Renderer Node can technically be any object in the context of core renderer
// logic - they are never directly operated on and always passed to the node op
// functions provided via options, so the internal constraint is really just
// a generic object.
export interface RendererNode {
  [key: string]: any
}

export interface RendererElement extends RendererNode {}

// An object exposing the internals of a renderer, passed to tree-shakeable
// features so that they can be decoupled from this file. Keys are shortened
// to optimize bundle size.
export interface RendererInternals<
  HostNode = RendererNode,
  HostElement = RendererElement
> {
  p: PatchFn
  um: UnmountFn
  r: RemoveFn
  m: MoveFn
  mt: MountComponentFn
  mc: MountChildrenFn
  pc: PatchChildrenFn
  pbc: PatchBlockChildrenFn
  n: NextFn
  o: RendererOptions<HostNode, HostElement>
}

// These functions are created inside a closure and therefore their types cannot
// be directly exported. In order to avoid maintaining function signatures in
// two places, we declare them once here and use them inside the closure.
type PatchFn = (
  n1: VNode | null, // null means this is a mount
  n2: VNode,
  container: RendererElement,
  anchor?: RendererNode | null,
  parentComponent?: ComponentInternalInstance | null,
  parentSuspense?: SuspenseBoundary | null,
  isSVG?: boolean,
  optimized?: boolean
) => void

type MountChildrenFn = (
  children: VNodeArrayChildren,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized: boolean,
  start?: number
) => void

type PatchChildrenFn = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized?: boolean
) => void

type PatchBlockChildrenFn = (
  oldChildren: VNode[],
  newChildren: VNode[],
  fallbackContainer: RendererElement,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean
) => void

type MoveFn = (
  vnode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  type: MoveType,
  parentSuspense?: SuspenseBoundary | null
) => void

type NextFn = (vnode: VNode) => RendererNode | null

type UnmountFn = (
  vnode: VNode,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  doRemove?: boolean
) => void

type RemoveFn = (vnode: VNode) => void

type UnmountChildrenFn = (
  children: VNode[],
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  doRemove?: boolean,
  start?: number
) => void

export type MountComponentFn = (
  initialVNode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized: boolean
) => void

type ProcessTextOrCommentFn = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null
) => void

export type SetupRenderEffectFn = (
  instance: ComponentInternalInstance,
  initialVNode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized: boolean
) => void

export const enum MoveType {
  ENTER,
  LEAVE,
  REORDER
}

const prodEffectOptions = {
  scheduler: queueJob
}

function createDevEffectOptions(
  instance: ComponentInternalInstance
): ReactiveEffectOptions {
  return {
    scheduler: queueJob,
    onTrack: instance.rtc ? e => invokeArrayFns(instance.rtc!, e) : void 0,
    onTrigger: instance.rtg ? e => invokeArrayFns(instance.rtg!, e) : void 0
  }
}

export const queuePostRenderEffect = __FEATURE_SUSPENSE__
  ? queueEffectWithSuspense
  : queuePostFlushCb

export const setRef = (
  rawRef: VNodeNormalizedRef,
  oldRawRef: VNodeNormalizedRef | null,
  parentComponent: ComponentInternalInstance,
  parentSuspense: SuspenseBoundary | null,
  vnode: VNode | null
) => {
  let value: ComponentPublicInstance | RendererNode | null
  if (!vnode) {
    value = null
  } else {
    if (vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
      value = vnode.component!.proxy
    } else {
      value = vnode.el
    }
  }

  const [owner, ref] = rawRef
  if (__DEV__ && !owner) {
    warn(
      `Missing ref owner context. ref cannot be used on hoisted vnodes. ` +
        `A vnode with ref must be created inside the render function.`
    )
    return
  }
  const oldRef = oldRawRef && oldRawRef[1]
  const refs = owner.refs === EMPTY_OBJ ? (owner.refs = {}) : owner.refs
  const setupState = owner.setupState

  // unset old ref
  if (oldRef != null && oldRef !== ref) {
    if (isString(oldRef)) {
      refs[oldRef] = null
      if (hasOwn(setupState, oldRef)) {
        setupState[oldRef] = null
      }
    } else if (isRef(oldRef)) {
      oldRef.value = null
    }
  }

  if (isString(ref)) {
    const doSet = () => {
      refs[ref] = value
      if (hasOwn(setupState, ref)) {
        setupState[ref] = value
      }
    }
    // #1789: for non-null values, set them after render
    // null values means this is unmount and it should not overwrite another
    // ref with the same key
    if (value) {
      ;(doSet as SchedulerCb).id = -1
      queuePostRenderEffect(doSet, parentSuspense)
    } else {
      doSet()
    }
  } else if (isRef(ref)) {
    const doSet = () => {
      ref.value = value
    }
    if (value) {
      ;(doSet as SchedulerCb).id = -1
      queuePostRenderEffect(doSet, parentSuspense)
    } else {
      doSet()
    }
  } else if (isFunction(ref)) {
    callWithErrorHandling(ref, parentComponent, ErrorCodes.FUNCTION_REF, [
      value,
      refs
    ])
  } else if (__DEV__) {
    warn('Invalid template ref type:', value, `(${typeof value})`)
  }
}

/**
 * The createRenderer function accepts two generic arguments:
 * HostNode and HostElement, corresponding to Node and Element types in the
 * host environment. For example, for runtime-dom, HostNode would be the DOM
 * `Node` interface and HostElement would be the DOM `Element` interface.
 *
 * Custom renderers can pass in the platform specific types like this:
 *
 * ``` js
 * const { render, createApp } = createRenderer<Node, Element>({
 *   patchProp,
 *   ...nodeOps
 * })
 * ```
 */
/**
 * createRenderer 函数接收 2 个泛型参数：HostNode 和 HostElement，在宿主环境中
 * 对应到节点和元素的类型。比如，对于 DOM 运行时环境，HostNode 就是 DOM `Node` interface
 * 并且 HostElement 就是 DOM `Element` interface
 */
export function createRenderer<
  HostNode = RendererNode,
  HostElement = RendererElement
>(options: RendererOptions<HostNode, HostElement>) {
  return baseCreateRenderer<HostNode, HostElement>(options)
}

// Separate API for creating hydration-enabled renderer.
// Hydration logic is only used when calling this function, making it
// tree-shakable.
export function createHydrationRenderer(
  options: RendererOptions<Node, Element>
) {
  return baseCreateRenderer(options, createHydrationFunctions)
}

// overload 1: no hydration
function baseCreateRenderer<
  HostNode = RendererNode,
  HostElement = RendererElement
>(options: RendererOptions<HostNode, HostElement>): Renderer<HostElement>

// overload 2: with hydration
function baseCreateRenderer(
  options: RendererOptions<Node, Element>,
  createHydrationFns: typeof createHydrationFunctions
): HydrationRenderer

// implementation
function baseCreateRenderer(
  options: RendererOptions,
  createHydrationFns?: typeof createHydrationFunctions
): any {
  // compile-time feature flags check
  if (__ESM_BUNDLER__ && !__TEST__) {
    initFeatureFlags()
  }

  // 对象的解构赋值的内部机制，是先找到同名属性，然后再赋给对应的变量。真正被赋值的是后者
  // 这些平台相关的方法是在创建渲染器阶段作为参数传入的
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    forcePatchProp: hostForcePatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    cloneNode: hostCloneNode,
    insertStaticContent: hostInsertStaticContent
  } = options

  // Note: functions inside this closure should use `const xxx = () => {}`
  // style in order to prevent being inlined by minifiers.
  // patch - 打补丁
  // 职责：
  //   1.先判断新旧节点是否是相同的 VNode 类型，若不是，则删除旧节点，挂载新节点
  //   2.如果是相同的 VNode 类型，走 Diff 更新流程，VNode 类型不同处理逻辑也不同
  const patch: PatchFn = (
    n1, // 旧的 vnode，当 n1 为 null 时，表示这是挂载过程
    n2, // 新的 vnode，类型不同，后续的执行逻辑也不同
    container, // DOM 容器，VNode 渲染生成 DOM 后，会挂载到 container 下
    anchor = null,
    parentComponent = null,
    parentSuspense = null,
    isSVG = false,
    optimized = false
  ) => {
    // patching & not same type, unmount old tree
    // 如果存在新旧节点，且新旧节点类型不同，则销毁旧节点
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1)
      unmount(n1, parentComponent, parentSuspense, true)
      // n1 设置为 null，确保后续都走 mount 逻辑
      n1 = null
    }

    // BAIL 不做 Diff 优化
    if (n2.patchFlag === PatchFlags.BAIL) {
      optimized = false
      n2.dynamicChildren = null
    }

    const { type, ref, shapeFlag } = n2 // 新节点
    // 新节点的类型不同，处理流程也不同
    switch (type) {
      case Text: // 处理文本节点
        processText(n1, n2, container, anchor)
        break
      case Comment: // 处理注释节点
        processCommentNode(n1, n2, container, anchor)
        break
      case Static: // 处理静态节点
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, isSVG)
        } else if (__DEV__) {
          patchStaticNode(n1, n2, container, isSVG)
        }
        break
      case Fragment: // 处理 Fragment 元素
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
        break
      default: // 可以性能优化的处理流程
        // 按位操作符 - 按位与，a & b：对于每一个比特位，只有两个操作数相应的比特位都是 1 时，结果才为 1，否则为 0
        if (shapeFlag & ShapeFlags.ELEMENT) { // 处理普通 DOM 元素 - 重点关注
          processElement(
            n1, // 旧节点
            n2, // 新节点
            container, // 挂载至的 DOM 容器
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        } else if (shapeFlag & ShapeFlags.COMPONENT) { // 处理组件 - 重点关注
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        } else if (shapeFlag & ShapeFlags.TELEPORT) { // 处理 TELEPORT
          ;(type as typeof TeleportImpl).process(
            n1 as TeleportVNode,
            n2 as TeleportVNode,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized,
            internals
          )
        } else if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) { // 处理 SUSPENSE
          ;(type as typeof SuspenseImpl).process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized,
            internals
          )
        } else if (__DEV__) {
          warn('Invalid VNode type:', type, `(${typeof type})`)
        }
    }

    // set ref
    // 每次 patch 都要重新设置 ref，这也就是为什么在编译阶段不对含有 ref 的节点进行提升的原因
    // 因为 ref 是当作动态属性来看待的
    if (ref != null && parentComponent) {
      setRef(ref, n1 && n1.ref, parentComponent, parentSuspense, n2)
    }
  }

  const processText: ProcessTextOrCommentFn = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        (n2.el = hostCreateText(n2.children as string)),
        container,
        anchor
      )
    } else {
      const el = (n2.el = n1.el!)
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children as string)
      }
    }
  }

  const processCommentNode: ProcessTextOrCommentFn = (
    n1,
    n2,
    container,
    anchor
  ) => {
    if (n1 == null) {
      hostInsert(
        (n2.el = hostCreateComment((n2.children as string) || '')),
        container,
        anchor
      )
    } else {
      // there's no support for dynamic comments
      n2.el = n1.el
    }
  }

  const mountStaticNode = (
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    isSVG: boolean
  ) => {
    // static nodes are only present when used with compiler-dom/runtime-dom
    // which guarantees presence of hostInsertStaticContent.
    ;[n2.el, n2.anchor] = hostInsertStaticContent!(
      n2.children as string,
      container,
      anchor,
      isSVG
    )
  }

  /**
   * Dev / HMR only
   */
  const patchStaticNode = (
    n1: VNode,
    n2: VNode,
    container: RendererElement,
    isSVG: boolean
  ) => {
    // static nodes are only patched during dev for HMR
    if (n2.children !== n1.children) {
      const anchor = hostNextSibling(n1.anchor!)
      // remove existing
      removeStaticNode(n1)
      // insert new
      ;[n2.el, n2.anchor] = hostInsertStaticContent!(
        n2.children as string,
        container,
        anchor,
        isSVG
      )
    } else {
      n2.el = n1.el
      n2.anchor = n1.anchor
    }
  }

  /**
   * Dev / HMR only
   */
  const moveStaticNode = (
    vnode: VNode,
    container: RendererElement,
    anchor: RendererNode | null
  ) => {
    let cur = vnode.el
    const end = vnode.anchor!
    while (cur && cur !== end) {
      const next = hostNextSibling(cur)
      hostInsert(cur, container, anchor)
      cur = next
    }
    hostInsert(end, container, anchor)
  }

  /**
   * Dev / HMR only
   */
  const removeStaticNode = (vnode: VNode) => {
    let cur = vnode.el
    while (cur && cur !== vnode.anchor) {
      const next = hostNextSibling(cur)
      hostRemove(cur)
      cur = next
    }
    hostRemove(vnode.anchor!)
  }

  // 处理普通 DOM 元素
  const processElement = (
    n1: VNode | null, // 旧节点
    n2: VNode, // 新节点
    container: RendererElement, // 挂在至的 DOM 容器
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    isSVG = isSVG || (n2.type as string) === 'svg'
    if (n1 == null) { // 如果没有旧节点 n1，走挂载元素流程
      // 挂载元素
      mountElement(
        n2, // 新节点
        container, // 挂在至的 DOM 容器
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    } else { // 否则走更新元素流程
      patchElement(n1, n2, parentComponent, parentSuspense, isSVG, optimized)
    }
  }

  // 挂载元素
  // 1.创建 DOM 元素节点
  // 2.挂载其子节点
  // 3.处理 props
  // 4.挂载该 DOM 元素至 Container 上
  const mountElement = (
    vnode: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    let el: RendererElement
    let vnodeHook: VNodeHook | undefined | null
    const {
      type,
      props,
      shapeFlag,
      transition,
      scopeId,
      patchFlag,
      dirs
    } = vnode
    if (
      !__DEV__ &&
      vnode.el &&
      hostCloneNode !== undefined &&
      patchFlag === PatchFlags.HOISTED
    ) {
      // If a vnode has non-null el, it means it's being reused.
      // Only static vnodes can be reused, so its mounted DOM nodes should be
      // exactly the same, and we can simply do a clone here.
      // only do this in production since cloned trees cannot be HMR updated.
      // 如果一个 VNode 有非 null 的 el 属性，那么意味着它会被重用
      // 只有静态节点会被重用，因此它的挂载的 DOM 节点也是相同的，所以这里可以简单地进行 clone
      // 由于 clone 的 tree 无法支持 HMR 更新，因此该优化仅在生产环境下生效
      el = vnode.el = hostCloneNode(vnode.el)
    } else {
      // 1.创建宿主环境下的 DOM 元素节点（平台相关 - Web 环境）
      el = vnode.el = hostCreateElement( // 在其中调用 document.createElement()
        vnode.type as string,
        isSVG,
        props && props.is
      )

      // mount children first, since some props may rely on child content
      // being already rendered, e.g. `<select value>`
      // 2.先挂载子节点：因为一些 props 需要依赖已渲染的子节点内容（比如 <select value>）
      if (shapeFlag & ShapeFlags.TEXT_CHILDREN) { // 文本子节点
        // 处理子节点是纯文本的情况（内部调用 DOM API el.textContent = vnode.children）
        hostSetElementText(el, vnode.children as string)
      } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) { // 数组子节点
        // 处理子节点是数组的情况
        mountChildren(
          vnode.children as VNodeArrayChildren, // 要进行遍历去挂载的数组子节点
          el, // 作为数组子节点要挂载至的 DOM 容器
          null,
          parentComponent,
          parentSuspense,
          isSVG && type !== 'foreignObject',
          optimized || !!vnode.dynamicChildren
        )
      }

      // props
      if (props) {
        // 3.处理 props，如果有 props，给这个 DOM 节点添加相关的 class、style、event 等属性，并做相应处理
        for (const key in props) {
          if (!isReservedProp(key)) {
            hostPatchProp(
              el,
              key,
              null,
              props[key],
              isSVG,
              vnode.children as VNode[],
              parentComponent,
              parentSuspense,
              unmountChildren
            )
          }
        }
        if ((vnodeHook = props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parentComponent, vnode)
        }
      }
      if (dirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount')
      }

      // scopeId
      if (scopeId) {
        hostSetScopeId(el, scopeId)
      }
      const treeOwnerId = parentComponent && parentComponent.type.__scopeId
      // vnode's own scopeId and the current patched component's scopeId is
      // different - this is a slot content node.
      if (treeOwnerId && treeOwnerId !== scopeId) {
        hostSetScopeId(el, treeOwnerId + '-s')
      }
    }
    // #1583 For inside suspense + suspense not resolved case, enter hook should call when suspense resolved
    // #1689 For inside suspense + suspense resolved case, just call it
    const needCallTransitionHooks =
      (!parentSuspense || (parentSuspense && parentSuspense!.isResolved)) &&
      transition &&
      !transition.persisted
    if (needCallTransitionHooks) {
      transition!.beforeEnter(el)
    }
    // 4.把创建的 DOM 元素节点挂载到 container 上
    // 其中会调用 DOM API container.insertBefore(el, anchor || null)
    hostInsert(el, container, anchor)
    if (
      (vnodeHook = props && props.onVnodeMounted) ||
      needCallTransitionHooks ||
      dirs
    ) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode)
        needCallTransitionHooks && transition!.enter(el)
        dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted')
      }, parentSuspense)
    }
  }

  // 挂载数组子节点：遍历 children 获取到每一个 child，然后递归执行 patch() 方法挂载每一个 child 
  const mountChildren: MountChildrenFn = (
    children,
    container, // 要挂载至的 DOM 容器
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    optimized,
    start = 0
  ) => {
    for (let i = start; i < children.length; i++) {
      // 预处理 child（编译优化）
      const child = (children[i] = optimized
        ? cloneIfMounted(children[i] as VNode)
        : normalizeVNode(children[i]))

      // 递归 patch 挂载 DOM（深度优先遍历树）
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    }
  }

  // 更新元素节点：主要更新 props 和更新元素子节点（这很好理解，因为一个 DOM 元素节点就是由自身属性和字节点构成的）
  const patchElement = (
    n1: VNode, // 旧节点
    n2: VNode, // 新节点
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    const el = (n2.el = n1.el!)
    let { patchFlag, dynamicChildren, dirs } = n2
    // #1426 take the old vnode's patch flag into account since user may clone a
    // compiler-generated vnode, which de-opts to FULL_PROPS
    patchFlag |= n1.patchFlag & PatchFlags.FULL_PROPS
    const oldProps = n1.props || EMPTY_OBJ
    const newProps = n2.props || EMPTY_OBJ
    let vnodeHook: VNodeHook | undefined | null

    if ((vnodeHook = newProps.onVnodeBeforeUpdate)) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate')
    }

    if (__DEV__ && isHmrUpdating) {
      // HMR updated, force full diff
      patchFlag = 0
      optimized = false
      dynamicChildren = null
    }

    if (patchFlag > 0) {
      // the presence of a patchFlag means this element's render code was
      // generated by the compiler and can take the fast path.
      // in this path old node and new node are guaranteed to have the same shape
      // (i.e. at the exact same position in the source template)
      if (patchFlag & PatchFlags.FULL_PROPS) {
        // element props contain dynamic keys, full diff needed
        // 更新 props：更新 DOM 节点的 class、style、event 及一些 DOM 属性
        patchProps(
          el,
          n2,
          oldProps,
          newProps,
          parentComponent,
          parentSuspense,
          isSVG
        )
      } else {
        // class
        // this flag is matched when the element has dynamic class bindings.
        if (patchFlag & PatchFlags.CLASS) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, 'class', null, newProps.class, isSVG)
          }
        }

        // style
        // this flag is matched when the element has dynamic style bindings
        if (patchFlag & PatchFlags.STYLE) {
          hostPatchProp(el, 'style', oldProps.style, newProps.style, isSVG)
        }

        // props
        // This flag is matched when the element has dynamic prop/attr bindings
        // other than class and style. The keys of dynamic prop/attrs are saved for
        // faster iteration.
        // Note dynamic keys like :[foo]="bar" will cause this optimization to
        // bail out and go through a full diff because we need to unset the old key
        if (patchFlag & PatchFlags.PROPS) {
          // if the flag is present then dynamicProps must be non-null
          const propsToUpdate = n2.dynamicProps!
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i]
            const prev = oldProps[key]
            const next = newProps[key]
            if (
              next !== prev ||
              (hostForcePatchProp && hostForcePatchProp(el, key))
            ) {
              hostPatchProp(
                el,
                key,
                prev,
                next,
                isSVG,
                n1.children as VNode[],
                parentComponent,
                parentSuspense,
                unmountChildren
              )
            }
          }
        }
      }

      // text
      // This flag is matched when the element has only dynamic text children.
      if (patchFlag & PatchFlags.TEXT) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children as string)
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      // unoptimized, full diff
      patchProps(
        el,
        n2,
        oldProps,
        newProps,
        parentComponent,
        parentSuspense,
        isSVG
      )
    }

    const areChildrenSVG = isSVG && n2.type !== 'foreignObject'
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren!,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        areChildrenSVG
      )
      if (__DEV__ && parentComponent && parentComponent.type.__hmrId) {
        traverseStaticChildren(n1, n2)
      }
    } else if (!optimized) {
      // full diff
      // 更新子节点
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        areChildrenSVG
      )
    }

    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
        dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated')
      }, parentSuspense)
    }
  }

  // The fast path for blocks.
  const patchBlockChildren: PatchBlockChildrenFn = (
    oldChildren,
    newChildren,
    fallbackContainer,
    parentComponent,
    parentSuspense,
    isSVG
  ) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i]
      const newVNode = newChildren[i]
      // Determine the container (parent element) for the patch.
      const container =
        // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        oldVNode.type === Fragment ||
        // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !isSameVNodeType(oldVNode, newVNode) ||
        // - In the case of a component, it could contain anything.
        oldVNode.shapeFlag & ShapeFlags.COMPONENT ||
        oldVNode.shapeFlag & ShapeFlags.TELEPORT
          ? hostParentNode(oldVNode.el!)!
          : // In other cases, the parent container is not actually used so we
            // just pass the block element here to avoid a DOM parentNode call.
            fallbackContainer
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        isSVG,
        true
      )
    }
  }

  const patchProps = (
    el: RendererElement,
    vnode: VNode,
    oldProps: Data,
    newProps: Data,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean
  ) => {
    if (oldProps !== newProps) {
      for (const key in newProps) {
        if (isReservedProp(key)) continue
        const next = newProps[key]
        const prev = oldProps[key]
        if (
          next !== prev ||
          (hostForcePatchProp && hostForcePatchProp(el, key))
        ) {
          hostPatchProp(
            el,
            key,
            prev,
            next,
            isSVG,
            vnode.children as VNode[],
            parentComponent,
            parentSuspense,
            unmountChildren
          )
        }
      }
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              isSVG,
              vnode.children as VNode[],
              parentComponent,
              parentSuspense,
              unmountChildren
            )
          }
        }
      }
    }
  }

  const processFragment = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    const fragmentStartAnchor = (n2.el = n1 ? n1.el : hostCreateText(''))!
    const fragmentEndAnchor = (n2.anchor = n1 ? n1.anchor : hostCreateText(''))!

    let { patchFlag, dynamicChildren } = n2
    if (patchFlag > 0) {
      optimized = true
    }

    if (__DEV__ && isHmrUpdating) {
      // HMR updated, force full diff
      patchFlag = 0
      optimized = false
      dynamicChildren = null
    }

    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor)
      hostInsert(fragmentEndAnchor, container, anchor)
      // a fragment can only have array children
      // since they are either generated by the compiler, or implicitly created
      // from arrays.
      mountChildren(
        n2.children as VNodeArrayChildren,
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    } else {
      if (
        patchFlag > 0 &&
        patchFlag & PatchFlags.STABLE_FRAGMENT &&
        dynamicChildren
      ) {
        // a stable fragment (template root or <template v-for>) doesn't need to
        // patch children order, but it may contain dynamicChildren.
        patchBlockChildren(
          n1.dynamicChildren!,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          isSVG
        )
        if (__DEV__ && parentComponent && parentComponent.type.__hmrId) {
          traverseStaticChildren(n1, n2)
        }
      } else {
        // keyed / unkeyed, or manual fragments.
        // for keyed & unkeyed, since they are compiler generated from v-for,
        // each child is guaranteed to be a block so the fragment will never
        // have dynamicChildren.
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      }
    }
  }

  // 处理组件：如果没有 n1 旧组件，则执行组件的挂载逻辑，否则执行组件的更新逻辑
  // 本质上，就是去判断子组件是否需要更新，如果需要则递归执行子组件的的副作用渲染函数来更新，
  // 否则仅仅更新一些 VNode 的属性，并让子组件实例保留对组件 VNode 的引用，用于子组件自身数据变化引起组件重新渲染的时候，
  // 在渲染函数内部可以拿到新的组件 VNode
  const processComponent = (
    n1: VNode | null, // 旧组件
    n2: VNode, // 新组件
    container: RendererElement, // 挂载组件的 DOM 容器
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    if (n1 == null) { // 旧组件为 null，则挂载组件
      if (n2.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        ;(parentComponent!.ctx as KeepAliveContext).activate(
          n2,
          container,
          anchor,
          isSVG,
          optimized
        )
      } else {
        // 挂载组件
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      }
    } else { // 更新组件
      updateComponent(n1, n2, optimized)
    }
  }

  // 挂载组件函数
  // 职责：
  //   1.创建组件实例：通过对象方式创建当前渲染的组件实例 instance
  //   2.设置组件实例：instance 存着组件相关数据，维护了组件上下文。设置以进行对 props、插槽及其他实例属性的初始化处理
  //   3.设置并运行带副作用的渲染函数
  const mountComponent: MountComponentFn = (
    initialVNode, // 要挂载的组件
    container, // 挂载组件的 DOM 容器
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    optimized
  ) => {
    // 职责1：创建组件实例
    const instance: ComponentInternalInstance = (initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    ))

    if (__DEV__ && instance.type.__hmrId) {
      registerHMR(instance)
    }

    if (__DEV__) {
      pushWarningContext(initialVNode)
      startMeasure(instance, `mount`)
    }

    // inject renderer internals for keepAlive
    if (isKeepAlive(initialVNode)) {
      ;(instance.ctx as KeepAliveContext).renderer = internals
    }

    // resolve props and slots for setup context
    if (__DEV__) {
      startMeasure(instance, `init`)
    }
    // 职责2：设置组件实例
    // instance 保留了很多组件相关的数据，维护了组件上下文，包括对 props、插槽以及其他实例的属性的初始化处理
    setupComponent(instance)
    if (__DEV__) {
      endMeasure(instance, `init`)
    }

    // setup() is async. This component relies on async logic to be resolved
    // before proceeding
    if (__FEATURE_SUSPENSE__ && instance.asyncDep) {
      if (!parentSuspense) {
        if (__DEV__) warn('async setup() is used without a suspense boundary!')
        return
      }

      parentSuspense.registerDep(instance, setupRenderEffect)

      // Give it a placeholder if this is not hydration
      if (!initialVNode.el) {
        const placeholder = (instance.subTree = createVNode(Comment))
        processCommentNode(null, placeholder, container!, anchor)
      }
      return
    }

    // 职责3：设置并运行带副作用的渲染函数
    setupRenderEffect(
      instance,
      initialVNode,
      container,
      anchor,
      parentSuspense,
      isSVG,
      optimized
    )

    if (__DEV__) {
      popWarningContext()
      endMeasure(instance, `mount`)
    }
  }

  // 虽然 Vue.js 的更新粒度是组件级别的，组件的数据变化只会影响当前组件的更新，但是在组件更新的过程中，也会对子组件做一定的检查，
  // 判断子组件是否也要更新，并通过某种机制避免子组件重复更新
  const updateComponent = (n1: VNode, n2: VNode, optimized: boolean) => {
    const instance = (n2.component = n1.component)!
    // 根据新旧组件 VNode 来判断是否需要更新组件（主要通过对比 VNode 中的 props、children、dirs、transition 等属性）
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (
        __FEATURE_SUSPENSE__ &&
        instance.asyncDep &&
        !instance.asyncResolved
      ) {
        // async & still pending - just update props and slots
        // since the component's reactive effect for render isn't set-up yet
        if (__DEV__) {
          pushWarningContext(n2)
        }
        updateComponentPreRender(instance, n2, optimized)
        if (__DEV__) {
          popWarningContext()
        }
        return
      } else {
        // normal update
        instance.next = n2
        // in case the child component is also queued, remove it to avoid
        // double updating the same child component in the same flush.
        // 避免子组件由于自身数据变化导致的重复更新
        invalidateJob(instance.update)
        // instance.update is the reactive effect runner.
        instance.update()
      }
    } else {
      // no update needed. just copy over properties
      // 不需要更新，只需要复制属性
      n2.component = n1.component
      n2.el = n1.el
      instance.vnode = n2
    }
  }

  // 设置并运行带副作用的渲染函数
  const setupRenderEffect: SetupRenderEffectFn = (
    instance, // 组件实例
    initialVNode, // 要挂载的组件
    container, // 挂载组件的 DOM 容器
    anchor,
    parentSuspense,
    isSVG,
    optimized
  ) => {
    // create reactive effect for rendering
    // 创建响应式的副作用渲染函数
    // 职责：
    //   1.初始渲染：
    //     （1）渲染组件生成 subTree
    //     （2）把 subTree 挂载到 container 中
    // 利用响应式库的 effect() 函数创建了一个副作用渲染函数 componentEffect()
    // 副作用：当组件的数据发生变化时，effect 函数包裹的 componentEffect() 函数会重新执行一遍，从而重新渲染组件
    instance.update = effect(function componentEffect() {
      // 判断是「初始渲染」还是还是「组件更新」
      if (!instance.isMounted) { // 初始渲染
        let vnodeHook: VNodeHook | null | undefined
        const { el, props } = initialVNode
        const { bm, m, parent } = instance
        if (__DEV__) {
          startMeasure(instance, `render`)
        }
        // 渲染组件生成子树 subTree，它也是一个 VNode 对象
        // renderComponentRoot() 执行 render 函数创建整个组件树内部的 vnode，把这个 vnode 经过内部一层标准化，最终得到子树 VNode
        const subTree = (instance.subTree = renderComponentRoot(instance))
        if (__DEV__) {
          endMeasure(instance, `render`)
        }
        // beforeMount hook
        if (bm) {
          invokeArrayFns(bm)
        }
        // onVnodeBeforeMount
        if ((vnodeHook = props && props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parent, initialVNode)
        }
        if (el && hydrateNode) {
          if (__DEV__) {
            startMeasure(instance, `hydrate`)
          }
          // vnode has adopted host node - perform hydration instead of mount.
          hydrateNode(
            initialVNode.el as Node,
            subTree,
            instance,
            parentSuspense
          )
          if (__DEV__) {
            endMeasure(instance, `hydrate`)
          }
        } else {
          if (__DEV__) {
            startMeasure(instance, `patch`)
          }
          // 把子树 vnode 挂载到 container 中
          patch(
            null, // n1 旧组件传 null，则是挂载
            subTree, // n2 为要挂载的 subTree
            container, // 挂载至的 DOM 容器
            anchor,
            instance,
            parentSuspense,
            isSVG
          )
          if (__DEV__) {
            endMeasure(instance, `patch`)
          }
          // 保留渲染生成的子树根 DOM 节点
          initialVNode.el = subTree.el
        }
        // mounted hook
        if (m) {
          queuePostRenderEffect(m, parentSuspense)
        }
        // onVnodeMounted
        if ((vnodeHook = props && props.onVnodeMounted)) {
          queuePostRenderEffect(() => {
            invokeVNodeHook(vnodeHook!, parent, initialVNode)
          }, parentSuspense)
        }
        // activated hook for keep-alive roots.
        // #1742 activated hook must be accessed after first render
        // since the hook may be injected by a child keep-alive
        const { a } = instance
        if (
          a &&
          initialVNode.shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
        ) {
          queuePostRenderEffect(a, parentSuspense)
        }
        instance.isMounted = true
      } else {
        // 组件更新：
        //   1.更新组件的 VNode 节点信息（通过执行 updateComponentPreRender）
        //   2.渲染新的子树 VNode（通过执行 renderComponentRoot）
        //   3.根据新旧子树 VNode 执行 patch 逻辑（通过执行 patch）
        // updateComponent
        // This is triggered by mutation of component's own state (next: null)
        // OR parent calling processComponent (next: VNode)
        // 组件自身状态的改变（next: null）或者父级调用 processComponent（next: VNode）都会触发组件更新
        let { next, bu, u, parent, vnode } = instance
        let originNext = next
        let vnodeHook: VNodeHook | null | undefined
        if (__DEV__) {
          pushWarningContext(next || instance.vnode)
        }

        // next 表示新组件的 VNode
        // 一个组件重新渲染可能会有 2 种场景：
        //   一种是组件本身的数据变化，这种情况下 next 是 null
        //   另一种是父组件在更新过程中，遇到子组件节点。先判断子组件是否需要更新，如果需要则主动执行子组件的重新渲染方法，这种情况下
        // next 就是新的子组件 VNode
        if (next) {
          // 更新组件 VNode 节点信息
          updateComponentPreRender(instance, next, optimized)
        } else {
          next = vnode
        }
        if (__DEV__) {
          startMeasure(instance, `render`)
        }
        // 渲染新的子树 VNode
        const nextTree = renderComponentRoot(instance)
        if (__DEV__) {
          endMeasure(instance, `render`)
        }
        // 缓存旧的子树 VNode
        const prevTree = instance.subTree
        // 更新子树 VNode
        instance.subTree = nextTree
        next.el = vnode.el
        // beforeUpdate hook
        if (bu) {
          invokeArrayFns(bu)
        }
        // onVnodeBeforeUpdate
        if ((vnodeHook = next.props && next.props.onVnodeBeforeUpdate)) {
          invokeVNodeHook(vnodeHook, parent, next, vnode)
        }
        // reset refs
        // only needed if previous patch had refs
        if (instance.refs !== EMPTY_OBJ) {
          instance.refs = {}
        }
        if (__DEV__) {
          startMeasure(instance, `patch`)
        }
        // 组件更新核心逻辑，根据新旧子树 VNode 做 patch。找出新旧子树 VNode 的不同，并用合适的方式更新 DOM
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          // Teleport 组件中父节点可能已改变，所以容器直接找旧树 DOM 元素的父节点
          hostParentNode(prevTree.el!)!,
          // anchor may have changed if it's in a fragment
          // Fragment 情况下参考节点可能已改变，所以直接找旧树 DOM 元素的下一个节点
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          isSVG
        )
        if (__DEV__) {
          endMeasure(instance, `patch`)
        }
        
        // 缓存更新后的 DOM 节点
        next.el = nextTree.el
        if (originNext === null) {
          // self-triggered update. In case of HOC, update parent component
          // vnode el. HOC is indicated by parent instance's subTree pointing
          // to child component's vnode
          updateHOCHostEl(instance, nextTree.el)
        }
        // updated hook
        if (u) {
          queuePostRenderEffect(u, parentSuspense)
        }
        // onVnodeUpdated
        if ((vnodeHook = next.props && next.props.onVnodeUpdated)) {
          queuePostRenderEffect(() => {
            invokeVNodeHook(vnodeHook!, parent, next!, vnode)
          }, parentSuspense)
        }

        if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
          devtoolsComponentUpdated(instance)
        }

        if (__DEV__) {
          popWarningContext()
        }
      }
    }, __DEV__ ? createDevEffectOptions(instance) : prodEffectOptions)
    // #1801 mark it to allow recursive updates
    ;(instance.update as SchedulerJob).allowRecurse = true
  }

  // 在更新组件的 DOM 前，需要先更新组件 vnode 节点信息，包括改组件实例的 vnode 指针、更新 props 和更新插槽等
  const updateComponentPreRender = (
    instance: ComponentInternalInstance,
    nextVNode: VNode,
    optimized: boolean
  ) => {
    if (__DEV__ && instance.type.__hmrId) {
      optimized = false
    }
    // 新组件 VNode 的 component 指向组件实例
    nextVNode.component = instance
    // 缓存旧组件 VNode 的 props
    const prevProps = instance.vnode.props
    // 组件实例的 VNode 指向指向新组件 VNode
    instance.vnode = nextVNode
    // 清空 next 属性，为下一次重新渲染做准备
    instance.next = null
    // 更新 props
    updateProps(instance, nextVNode.props, prevProps, optimized)
    // 更新 插槽
    updateSlots(instance, nextVNode.children)

    // props update may have triggered pre-flush watchers.
    // flush them before the render update.
    flushPreFlushCbs(undefined, instance.update)
  }

  // 更新子节点
  const patchChildren: PatchChildrenFn = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    isSVG,
    optimized = false
  ) => {
    const c1 = n1 && n1.children // 旧节点的子节点
    const prevShapeFlag = n1 ? n1.shapeFlag : 0
    const c2 = n2.children // 新节点的子节点

    const { patchFlag, shapeFlag } = n2
    // fast path
    if (patchFlag > 0) {
      if (patchFlag & PatchFlags.KEYED_FRAGMENT) {
        // this could be either fully-keyed or mixed (some keyed some not)
        // presence of patchFlag means children are guaranteed to be arrays
        patchKeyedChildren(
          c1 as VNode[],
          c2 as VNodeArrayChildren,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
        return
      } else if (patchFlag & PatchFlags.UNKEYED_FRAGMENT) {
        // unkeyed
        patchUnkeyedChildren(
          c1 as VNode[],
          c2 as VNodeArrayChildren,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
        return
      }
    }

    // children has 3 possibilities: text, array or no children.
    // 子节点有 3 种可能的情况：文本、数组、空（所以新旧子节点的情况排列组合，就有 9 种情况）
    // A.若旧子节点是纯文本：
    //   1.若新子节点也是纯文本，那么替换为新子节点
    //   2.若新子节点为空，那么删除旧子节点
    //   3.若新子节点是 VNode 数组，那么先把旧子节点的文本清空，再去旧子节点的父容器下添加多个新子节点
    // B.若旧子节点为空：
    //   1.若新子节是纯文本，那么在旧子节点父容器下添加文本节点
    //   2.若新子节点也是空，什么都不做
    //   3.若新子节点是 VNode 数组，那么在旧子节点父容器下添加多个新子节点
    // C.若旧子节点是 VNode 数组：
    //   1.若新子节是纯文本，那么先删除旧子节点，再去旧子节点父容器下添加新文本节点
    //   2.若新子节点是空，那么删除旧子节点
    //   3.若新子节点也是 VNode 数组，那么完整地 Diff 新旧子节点 --> 内部运用了「核心 Diff 算法」
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      // text children fast path
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        unmountChildren(c1 as VNode[], parentComponent, parentSuspense)
      }
      // 若文本对比不同，则替换为新文本
      if (c2 !== c1) {
        // 调用宿主环境的设置元素文本（浏览器下 el.textContent = text）
        hostSetElementText(container, c2 as string)
      }
    } else {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 若旧子节点是数组
        // prev children was array
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 若新的子节点也是数组，则做完成 Diff
          // two arrays, cannot assume anything, do full diff
          patchKeyedChildren(
            c1 as VNode[],
            c2 as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        } else {
          // no new children, just unmount old
          // 数组 -> 则仅仅删除之前的子节点
          unmountChildren(c1 as VNode[], parentComponent, parentSuspense, true)
        }
      } else {
        // prev children was text OR null
        // new children is array OR null
        // 之前的子节点是文本或空
        // 新的子节点是数组或空
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          // 如果之前子节点是文本，则将它清空
          hostSetElementText(container, '')
        }
        // mount new if array
        // 如果新的子节点是数组，则挂载新子节点
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          mountChildren(
            c2 as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
        }
      }
    }
  }

  const patchUnkeyedChildren = (
    c1: VNode[],
    c2: VNodeArrayChildren,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    c1 = c1 || EMPTY_ARR
    c2 = c2 || EMPTY_ARR
    const oldLength = c1.length
    const newLength = c2.length
    const commonLength = Math.min(oldLength, newLength)
    let i
    for (i = 0; i < commonLength; i++) {
      const nextChild = (c2[i] = optimized
        ? cloneIfMounted(c2[i] as VNode)
        : normalizeVNode(c2[i]))
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    }
    if (oldLength > newLength) {
      // remove old
      unmountChildren(c1, parentComponent, parentSuspense, true, commonLength)
    } else {
      // mount new
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized,
        commonLength
      )
    }
  }

  // can be all-keyed or mixed
  // 核心 Diff 算法
  // 对于旧子节点数组的变化，节点操作离不开 4 种：新增、删除、移动、更新
  // 已知：
  //   1.旧子节点的 DOM 结构
  //   2.旧子节点 VNode
  //   3.新子节点 VNode
  // 目的：以较低成本完成子节点的更新
  // 算法中持续维护着：待遍历索引 i、旧子节点的尾部索引 e1、新子节点的尾部索引 e2
  const patchKeyedChildren = (
    c1: VNode[], // 旧子节点数组
    c2: VNodeArrayChildren, // 新子节点数组
    container: RendererElement, // 父容器 DOM
    parentAnchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    let i = 0 // 待遍历索引
    const l2 = c2.length // 新子节点个数
    let e1 = c1.length - 1 // prev ending index 旧子节点的尾部索引
    let e2 = l2 - 1 // next ending index 新子节点的尾部索引

    // 1. sync from start
    // 同步头部节点：从头部开始，依次对比新旧节点的类型和 Key：
    //   若相同，则递归 patch 更新节点
    //   若不同，或者索引 i 大于索引 e1 或 e2，则同步过程结束
    // 初始时： i = 0，e1 = 2，e2 = 3
    // (a b) c
    // (a b) d e
    while (i <= e1 && i <= e2) {
      const n1 = c1[i] // 当前遍历的旧子节点
      const n2 = (c2[i] = optimized // 当前遍历的新子节点
        ? cloneIfMounted(c2[i] as VNode)
        : normalizeVNode(c2[i]))
      
      // 通常在开发过程中，会给 v-for 生成的列表中的每一项分配唯一 key 作为项的唯一 ID，这个 key 在 diff 过程中十分关键
      // 对于新旧子序列中的节点，我们认为 key 相同的就是同一个节点，直接执行 patch 更新即可
      if (isSameVNodeType(n1, n2)) { // 若 n1、n2 节点类型和 Key 相同，递归执行 patch() 做更新
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      } else {
        break
      }
      i++
    }

    // 2. sync from end
    // 同步尾部节点：从尾部开始，依次对比新旧节点类型：
    //   若相同，则递归 patch 更新节点
    //   若不同，或者索引 i 大于索引 e1 或 e2，则同步过程结束
    // a (b c)
    // d e (b c)
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1] // 当前遍历的旧尾部子节点
      const n2 = (c2[e2] = optimized // 当前遍历的新尾部子节点
        ? cloneIfMounted(c2[e2] as VNode)
        : normalizeVNode(c2[e2]))
      if (isSameVNodeType(n1, n2)) { // 若 n1、n2 类型相同，递归执行 patch() 做更新
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      } else {
        break
      }
      // 完成尾部节点的同步后，分别递减新旧尾节点索引
      e1--
      e2--
    }

    // 接下来，中间那段，有 3 种情况需要处理：
    //   A.有剩余要添加的新子节点
    //   B.有剩余要删除的旧子节点
    //   C.未知新旧子节点序列

    // 3. common sequence + mount
    // 挂载一段新的子节点
    // (a b)
    // (a b) c
    // i = 2, e1 = 1, e2 = 2
    // (a b)
    // c (a b)
    // i = 0, e1 = -1, e2 = 0
    if (i > e1) { // 待遍历索引 > 旧子节点尾部索引
      if (i <= e2) { // 待遍历索引 <= 新子节点尾部索引
        // 下面直接挂载从索引 i 到索引 e2 之间的这段新子节点
        const nextPos = e2 + 1
        const anchor = nextPos < l2 ? (c2[nextPos] as VNode).el : parentAnchor
        while (i <= e2) {
          // 挂载新节点
          patch(
            null,
            (c2[i] = optimized
              ? cloneIfMounted(c2[i] as VNode)
              : normalizeVNode(c2[i])),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG
          )
          i++
        }
      }
    }

    // 如果不满足添加新节点情况，那么接着判断旧子节点是否有剩余，满足则删除旧子节点
    // 4. common sequence + unmount
    // 删除一段旧的子节点
    // (a b) c
    // (a b)
    // i = 2, e1 = 2, e2 = 1
    // a (b c)
    // (b c)
    // i = 0, e1 = 0, e2 = -1
    else if (i > e2) {
      while (i <= e1) {
        // 直接删除从索引 i 开始到索引 e1 之间的这段旧子节点
        unmount(c1[i], parentComponent, parentSuspense, true)
        i++
      }
    }

    // 承上启下的小结：
    //   当两个节点类型（这里指 type 和 key）相同时，执行「更新」操作
    //   当新子节点中没有旧子节点中某些节点时，执行「删除」操作
    //   当新子节点中多了旧子节点中没有的节点是，执行「添加」操作
    // 这些都相对较简单，最麻烦的是「移动」操作：
    //   既要判断哪些节点要移动
    //   又要确定如何移动
    // 目标：如何用最少的移动？

    // 接下来，要处理「未知子序列」，在这段新旧子节点序列中：
    //   找出相同（type 和 key）节点，并更新
    //   找出多余旧子节点，并删除
    //   找出新的节点，并添加
    //   找出是否有需要移动位置的节点，如果有，并移动

    // 在查找过程中需要对比新旧子序列。如：遍历旧子序列过程中，判断某节点是否存在于新子序列。这就需要「双重循环」，它的时间复杂度是 O(n2)
    // 为了优化这个复杂度，可以采用一种「空间换时间」的思路，建立「索引图」，把时间复杂度降低到 O(n)

    // 5. unknown sequence
    // 处理未知子序列
    // [i ... e1 + 1]: a b [c d e] f g
    // [i ... e2 + 1]: a b [e d c h] f g
    // i = 2, e1 = 4, e2 = 5
    else {
      const s1 = i // prev starting index 旧子序列开始遍历的索引
      const s2 = i // next starting index 新子序列开始遍历的索引，新旧都从 i 开始

      // 5.1 build key:index map for newChildren
      // 构建出 key:index 的新子节点的索引图 Map
      const keyToNewIndexMap: Map<string | number, number> = new Map() // Map<key, index> 结构
      for (i = s2; i <= e2; i++) {
        // 先取到当前遍历的新子节点
        const nextChild = (c2[i] = optimized
          ? cloneIfMounted(c2[i] as VNode)
          : normalizeVNode(c2[i]))
        // 然后将节点的 key 和索引 set 进索引图中
        if (nextChild.key != null) {
          if (__DEV__ && keyToNewIndexMap.has(nextChild.key)) {
            warn(
              `Duplicate keys found during update:`,
              JSON.stringify(nextChild.key),
              `Make sure keys are unique.`
            )
          }
          keyToNewIndexMap.set(nextChild.key, i) // 注意：这里假设了所有节点都是有 key 标识的
        }
      }
      // 执行后，得到的新子节点索引图：{ e: 2, d: 3, c: 4, h: 5 }

      // 5.2 loop through old children left to be patched and try to patch
      // matching nodes & remove nodes that are no longer present
      // 遍历旧子节点：
      //   1.有相同（type 和 key 相同）节点就 patch 更新
      //   2.移除不在新子节点中的节点
      //   3.判断是否需要移动节点
      let j
      let patched = 0
      const toBePatched = e2 - s2 + 1 // 新子节点的长度
      let moved = false // 是否存在要移动的节点
      // used to track whether any node has moved
      // 用于跟踪是否已有节点移动
      let maxNewIndexSoFar = 0
      // works as Map<newIndex, oldIndex>
      // Note that oldIndex is offset by +1
      // and oldIndex = 0 is a special value indicating the new node has
      // no corresponding old node.
      // used for determining longest stable subsequence
      // 这个数组存储新子节点在旧子节点序列中的索引，用于确定「最长递增序列」
      const newIndexToOldIndexMap = new Array(toBePatched)
      // 初始化数组，各元素值均为 0
      // 旧子节点索引 = 0 是一个特殊值，意味着该新子节点没有对应的旧子节点
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0

      // 正序遍历旧子节点序列
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i] // 当前遍历的旧子节点
        if (patched >= toBePatched) {
          // all new children have been patched so this can only be a removal
          // 如果所有新子节点均已更新（patch），而对旧子序列的遍历还没结束，那么剩余旧子节点是多余的，删除就好
          unmount(prevChild, parentComponent, parentSuspense, true)
          continue
        }
        let newIndex
        if (prevChild.key != null) {
          // 在新子节点索引图中，查找与旧子节点相同的新子节点
          newIndex = keyToNewIndexMap.get(prevChild.key)
        } else {
          // key-less node, try to locate a key-less node of the same type
          for (j = s2; j <= e2; j++) {
            if (
              newIndexToOldIndexMap[j - s2] === 0 &&
              isSameVNodeType(prevChild, c2[j] as VNode)
            ) {
              newIndex = j
              break
            }
          }
        }
        if (newIndex === undefined) {
          // 找不到，则说明当前旧子节点不在新子节点序列中，删除即可
          unmount(prevChild, parentComponent, parentSuspense, true)
        } else {
          // 注意：这里对 i 进行了偏移，避免了为 0 的特殊情况
          // 如果遍历完了仍有元素的值为 0，则说明遍历旧子序列的过程中没有处理过这个节点，这个节点是新添加的
          newIndexToOldIndexMap[newIndex - s2] = i + 1

          // maxNewIndexSoFar 始终存储的是上次求值的 newIndex，如果不是一直递增，则说明有移动
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex
          } else {
            moved = true
          }
          // 更新旧子序列中匹配的节点
          patch(
            prevChild,
            c2[newIndex] as VNode,
            container,
            null,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
          patched++
        }
      }
      // 小结流程：
      //   1.正序遍历旧子序列，根据 keyToNewIndexMap 查找旧节点在新子序列索引中的位置
      //   2.若找不到，说明新节点序列中没有，则删除
      //   3.若找到，则将索引更新到 newIndexToOldIndexMap 中
      // 至此，已完成了新旧子节点的更新、多余旧节点的删除，并且建立了 newIndexToOldIndexMap 存储新旧子节点序列的映射，并确定是否有移动

      // 5.3 move and mount
      // 移动和挂载新节点
      // generate longest stable subsequence only when nodes have moved
      // 仅当节点移动时，才生成「最长递增子序列」
      const increasingNewIndexSequence = moved
        ? getSequence(newIndexToOldIndexMap)
        : EMPTY_ARR
      j = increasingNewIndexSequence.length - 1 // 最长递增序列的末尾索引
      // looping backwards so that we can use last patched node as anchor
      // 倒序遍历新子序列，因为我们可以使用最后更新的节点作为锚点
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i // 当前遍历的索引，倒序遍历
        const nextChild = c2[nextIndex] as VNode
        // 锚点指向上一个更新的节点，如果超过了子序列长度，则指向 parentAnchor
        const anchor =
          nextIndex + 1 < l2 ? (c2[nextIndex + 1] as VNode).el : parentAnchor
        if (newIndexToOldIndexMap[i] === 0) {
          // mount new
          // 在「新旧索引映射数组」中，若当前遍历的旧子节点索引是 0，则表示旧序列中没有此新节点，需要挂载
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG
          )
        } else if (moved) {
          // move if:
          // There is no stable subsequence (e.g. a reverse)
          // OR current node is not among the stable sequence
          // 当以下 2 种情况时需要移动：
          //   1.没有最长递增子序列，比如 reverse 后的序列
          //   2.当前节点不在最长递增子序列中
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, MoveType.REORDER)
          } else {
            j--
          }
        }
      }
    }
  }
  // 小结：至此，求解出了从旧子序列生成新子序列 DOM 的新增、删除、更新、移动等系列操作，并且已较小成本的方式完成 DOM 更新

  const move: MoveFn = (
    vnode,
    container,
    anchor,
    moveType,
    parentSuspense = null
  ) => {
    const { el, type, transition, children, shapeFlag } = vnode
    if (shapeFlag & ShapeFlags.COMPONENT) {
      move(vnode.component!.subTree, container, anchor, moveType)
      return
    }

    if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
      vnode.suspense!.move(container, anchor, moveType)
      return
    }

    if (shapeFlag & ShapeFlags.TELEPORT) {
      ;(type as typeof TeleportImpl).move(vnode, container, anchor, internals)
      return
    }

    if (type === Fragment) {
      hostInsert(el!, container, anchor)
      for (let i = 0; i < (children as VNode[]).length; i++) {
        move((children as VNode[])[i], container, anchor, moveType)
      }
      hostInsert(vnode.anchor!, container, anchor)
      return
    }

    // static node move can only happen when force updating HMR
    if (__DEV__ && type === Static) {
      moveStaticNode(vnode, container, anchor)
      return
    }

    // single nodes
    const needTransition =
      moveType !== MoveType.REORDER &&
      shapeFlag & ShapeFlags.ELEMENT &&
      transition
    if (needTransition) {
      if (moveType === MoveType.ENTER) {
        transition!.beforeEnter(el!)
        hostInsert(el!, container, anchor)
        queuePostRenderEffect(() => transition!.enter(el!), parentSuspense)
      } else {
        const { leave, delayLeave, afterLeave } = transition!
        const remove = () => hostInsert(el!, container, anchor)
        const performLeave = () => {
          leave(el!, () => {
            remove()
            afterLeave && afterLeave()
          })
        }
        if (delayLeave) {
          delayLeave(el!, remove, performLeave)
        } else {
          performLeave()
        }
      }
    } else {
      hostInsert(el!, container, anchor)
    }
  }

  const unmount: UnmountFn = (
    vnode,
    parentComponent,
    parentSuspense,
    doRemove = false
  ) => {
    const {
      type,
      props,
      ref,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs
    } = vnode
    // unset ref
    if (ref != null && parentComponent) {
      setRef(ref, null, parentComponent, parentSuspense, null)
    }

    if (shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE) {
      ;(parentComponent!.ctx as KeepAliveContext).deactivate(vnode)
      return
    }

    const shouldInvokeDirs = shapeFlag & ShapeFlags.ELEMENT && dirs

    let vnodeHook: VNodeHook | undefined | null
    if ((vnodeHook = props && props.onVnodeBeforeUnmount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode)
    }

    if (shapeFlag & ShapeFlags.COMPONENT) {
      unmountComponent(vnode.component!, parentSuspense, doRemove)
    } else {
      if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
        vnode.suspense!.unmount(parentSuspense, doRemove)
        return
      }

      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'beforeUnmount')
      }

      if (
        dynamicChildren &&
        // #1153: fast path should not be taken for non-stable (v-for) fragments
        (type !== Fragment ||
          (patchFlag > 0 && patchFlag & PatchFlags.STABLE_FRAGMENT))
      ) {
        // fast path for block nodes: only need to unmount dynamic children.
        unmountChildren(dynamicChildren, parentComponent, parentSuspense)
      } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        unmountChildren(children as VNode[], parentComponent, parentSuspense)
      }

      // an unmounted teleport should always remove its children
      if (shapeFlag & ShapeFlags.TELEPORT) {
        ;(vnode.type as typeof TeleportImpl).remove(vnode, internals)
      }

      if (doRemove) {
        remove(vnode)
      }
    }

    if ((vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode)
        shouldInvokeDirs &&
          invokeDirectiveHook(vnode, null, parentComponent, 'unmounted')
      }, parentSuspense)
    }
  }

  const remove: RemoveFn = vnode => {
    const { type, el, anchor, transition } = vnode
    if (type === Fragment) {
      removeFragment(el!, anchor!)
      return
    }

    if (__DEV__ && type === Static) {
      removeStaticNode(vnode)
      return
    }

    const performRemove = () => {
      hostRemove(el!)
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave()
      }
    }

    if (
      vnode.shapeFlag & ShapeFlags.ELEMENT &&
      transition &&
      !transition.persisted
    ) {
      const { leave, delayLeave } = transition
      const performLeave = () => leave(el!, performRemove)
      if (delayLeave) {
        delayLeave(vnode.el!, performRemove, performLeave)
      } else {
        performLeave()
      }
    } else {
      performRemove()
    }
  }

  const removeFragment = (cur: RendererNode, end: RendererNode) => {
    // For fragments, directly remove all contained DOM nodes.
    // (fragment child nodes cannot have transition)
    let next
    while (cur !== end) {
      next = hostNextSibling(cur)!
      hostRemove(cur)
      cur = next
    }
    hostRemove(end)
  }

  const unmountComponent = (
    instance: ComponentInternalInstance,
    parentSuspense: SuspenseBoundary | null,
    doRemove?: boolean
  ) => {
    if (__DEV__ && instance.type.__hmrId) {
      unregisterHMR(instance)
    }

    const { bum, effects, update, subTree, um, da, isDeactivated } = instance
    // beforeUnmount hook
    if (bum) {
      invokeArrayFns(bum)
    }
    if (effects) {
      for (let i = 0; i < effects.length; i++) {
        stop(effects[i])
      }
    }
    // update may be null if a component is unmounted before its async
    // setup has resolved.
    if (update) {
      stop(update)
      unmount(subTree, instance, parentSuspense, doRemove)
    }
    // unmounted hook
    if (um) {
      queuePostRenderEffect(um, parentSuspense)
    }
    // deactivated hook
    if (
      da &&
      !isDeactivated &&
      instance.vnode.shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
    ) {
      queuePostRenderEffect(da, parentSuspense)
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true
    }, parentSuspense)

    // A component with async dep inside a pending suspense is unmounted before
    // its async dep resolves. This should remove the dep from the suspense, and
    // cause the suspense to resolve immediately if that was the last dep.
    if (
      __FEATURE_SUSPENSE__ &&
      parentSuspense &&
      !parentSuspense.isResolved &&
      !parentSuspense.isUnmounted &&
      instance.asyncDep &&
      !instance.asyncResolved
    ) {
      parentSuspense.deps--
      if (parentSuspense.deps === 0) {
        parentSuspense.resolve()
      }
    }

    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      devtoolsComponentRemoved(instance)
    }
  }

  const unmountChildren: UnmountChildrenFn = (
    children,
    parentComponent,
    parentSuspense,
    doRemove = false,
    start = 0
  ) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove)
    }
  }

  const getNextHostNode: NextFn = vnode => {
    if (vnode.shapeFlag & ShapeFlags.COMPONENT) {
      return getNextHostNode(vnode.component!.subTree)
    }
    if (__FEATURE_SUSPENSE__ && vnode.shapeFlag & ShapeFlags.SUSPENSE) {
      return vnode.suspense!.next()
    }
    return hostNextSibling((vnode.anchor || vnode.el)!)
  }

  /**
   * #1156
   * When a component is HMR-enabled, we need to make sure that all static nodes
   * inside a block also inherit the DOM element from the previous tree so that
   * HMR updates (which are full updates) can retrieve the element for patching.
   *
   * Dev only.
   */
  const traverseStaticChildren = (n1: VNode, n2: VNode) => {
    const ch1 = n1.children
    const ch2 = n2.children
    if (isArray(ch1) && isArray(ch2)) {
      for (let i = 0; i < ch1.length; i++) {
        // this is only called in the optimized path so array children are
        // guaranteed to be vnodes
        const c1 = ch1[i] as VNode
        const c2 = (ch2[i] = cloneIfMounted(ch2[i] as VNode))
        if (c2.shapeFlag & ShapeFlags.ELEMENT && !c2.dynamicChildren) {
          if (c2.patchFlag <= 0 || c2.patchFlag === PatchFlags.HYDRATE_EVENTS) {
            c2.el = c1.el
          }
          traverseStaticChildren(c1, c2)
        }
      }
    }
  }

  // 组件渲染的核心逻辑
  const render: RootRenderFunction = (vnode, container) => {
    if (vnode == null) { // 如果 vnode 为 null，「销毁」组件
      if (container._vnode) {
        unmount(container._vnode, null, null, true)
      }
    } else { // 否则「创建」或「更新」组件
      patch(container._vnode || null, vnode, container)
    }
    flushPostFlushCbs()
    container._vnode = vnode // 缓存 vnode 节点，表示已渲染
  }

  const internals: RendererInternals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  }

  let hydrate: ReturnType<typeof createHydrationFunctions>[0] | undefined
  let hydrateNode: ReturnType<typeof createHydrationFunctions>[1] | undefined
  if (createHydrationFns) {
    ;[hydrate, hydrateNode] = createHydrationFns(internals as RendererInternals<
      Node,
      Element
    >)
  }

  return {
    render,
    hydrate,
    createApp: createAppAPI(render, hydrate)
  }
}

export function invokeVNodeHook(
  hook: VNodeHook,
  instance: ComponentInternalInstance | null,
  vnode: VNode,
  prevVNode: VNode | null = null
) {
  callWithAsyncErrorHandling(hook, instance, ErrorCodes.VNODE_HOOK, [
    vnode,
    prevVNode
  ])
}

// https://en.wikipedia.org/wiki/Longest_increasing_subsequence
function getSequence(arr: number[]): number[] {
  const p = arr.slice()
  const result = [0]
  let i, j, u, v, c
  const len = arr.length
  for (i = 0; i < len; i++) {
    const arrI = arr[i]
    if (arrI !== 0) {
      j = result[result.length - 1]
      if (arr[j] < arrI) {
        p[i] = j
        result.push(i)
        continue
      }
      u = 0
      v = result.length - 1
      while (u < v) {
        c = ((u + v) / 2) | 0
        if (arr[result[c]] < arrI) {
          u = c + 1
        } else {
          v = c
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1]
        }
        result[u] = i
      }
    }
  }
  u = result.length
  v = result[u - 1]
  while (u-- > 0) {
    result[u] = v
    v = p[v]
  }
  return result
}
