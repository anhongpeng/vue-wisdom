// 用来标记 VNode 种类：不同类型对应不同编码
// 按位操作符 - 左移，a << b：https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators，
// 将其操作数当作 32 位的比特序列（由 0、1 组成）再操作，操作数字的二进制形式，但是返回值依然是标准的 JS 数值
export const enum ShapeFlags { // 数字枚举常量
  ELEMENT = 1, // 普通元素
  FUNCTIONAL_COMPONENT = 1 << 1, // 2，函数组件
  STATEFUL_COMPONENT = 1 << 2, // 4，状态组件
  TEXT_CHILDREN = 1 << 3, // 8，文本子节点
  ARRAY_CHILDREN = 1 << 4, // 16，数组子节点
  SLOTS_CHILDREN = 1 << 5, // 32，插槽子节点
  TELEPORT = 1 << 6, // 64，传送组件
  SUSPENSE = 1 << 7, // 128，悬念组件
  COMPONENT_SHOULD_KEEP_ALIVE = 1 << 8,
  COMPONENT_KEPT_ALIVE = 1 << 9,
  COMPONENT = ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT
}
