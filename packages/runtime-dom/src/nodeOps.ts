import { RendererOptions } from '@vue/runtime-core'

export const svgNS = 'http://www.w3.org/2000/svg'

const doc = (typeof document !== 'undefined' ? document : null) as Document

let tempContainer: HTMLElement
let tempSVGContainer: SVGElement

export const nodeOps: Omit<RendererOptions<Node, Element>, 'patchProp'> = {
  insert: (child, parent, anchor) => {
    // DOM API Node.insertBefore() | MDN：https://developer.mozilla.org/zh-CN/docs/Web/API/Node/insertBefore
    parent.insertBefore(child, anchor || null)
  },

  remove: child => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  // DOM API createElement | MDN：https://developer.mozilla.org/zh-CN/docs/Web/API/Document/createElement
  createElement: (tag, isSVG, is): Element =>
    isSVG
      ? doc.createElementNS(svgNS, tag)
      : doc.createElement(tag, is ? { is } : undefined),

  createText: text => doc.createTextNode(text),

  createComment: text => doc.createComment(text),

  setText: (node, text) => {
    node.nodeValue = text
  },

  // 设置元素的文本内容
  // Node.textContent | MDN：https://developer.mozilla.org/zh-CN/docs/Web/API/Node/textContent
  setElementText: (el, text) => {
    el.textContent = text
  },

  parentNode: node => node.parentNode as Element | null,

  nextSibling: node => node.nextSibling,

  querySelector: selector => doc.querySelector(selector),

  setScopeId(el, id) {
    el.setAttribute(id, '')
  },

  cloneNode(el) {
    return el.cloneNode(true)
  },

  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, isSVG) {
    const temp = isSVG
      ? tempSVGContainer ||
        (tempSVGContainer = doc.createElementNS(svgNS, 'svg'))
      : tempContainer || (tempContainer = doc.createElement('div'))
    temp.innerHTML = content
    const first = temp.firstChild as Element
    let node: Element | null = first
    let last: Element = node
    while (node) {
      last = node
      nodeOps.insert(node, parent, anchor)
      node = temp.firstChild as Element
    }
    return [first, last]
  }
}
