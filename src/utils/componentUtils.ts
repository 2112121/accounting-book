// 管理需要单例实例的组件状态

// 存储当前打开的组件实例
interface OpenComponents {
  [key: string]: boolean;
}

// 初始化时所有组件都是关闭状态
const openComponents: OpenComponents = {};

// 提供全局紧急重置函数
(window as any).resetAllComponents = () => {
  Object.keys(openComponents).forEach(key => {
    openComponents[key] = false;
  });
  // 如果好友管理组件有自己的清理函数，也调用它
  if (typeof (window as any).cleanupFriendManagementInstances === 'function') {
    (window as any).cleanupFriendManagementInstances();
  }
};

/**
 * 检查特定组件是否已打开
 * @param componentKey 组件的唯一标识
 * @returns 组件是否已经打开
 */
export const isComponentOpen = (componentKey: string): boolean => {
  // 添加调试日志
  return !!openComponents[componentKey];
};

/**
 * 特殊函数：检查好友管理组件是否已打开
 * 父组件可以在打开好友管理前调用此函数
 */
export const isFriendManagementOpen = (): boolean => {
  const isOpen = isComponentOpen('friendManagement');
  return isOpen;
};

/**
 * 将组件标记为已打开
 * @param componentKey 组件的唯一标识
 */
export const markComponentAsOpen = (componentKey: string): void => {
  openComponents[componentKey] = true;
};

/**
 * 将组件标记为已关闭
 * @param componentKey 组件的唯一标识
 */
export const markComponentAsClosed = (componentKey: string): void => {
  openComponents[componentKey] = false;
};

/**
 * 重置所有组件状态
 */
export const resetAllComponentsState = (): void => {
  // 清空对象
  Object.keys(openComponents).forEach(key => {
    openComponents[key] = false;
  });
};

// 确保初始状态正确
resetAllComponentsState();

/**
 * 检查组件是否可以打开，如果可以则标记为打开并返回true
 * @param componentKey 组件的唯一标识
 * @returns 组件是否可以打开
 */
export const checkAndMarkComponentOpen = (componentKey: string): boolean => {
  if (openComponents[componentKey]) {
    return false; // 组件已打开，不能再次打开
  }
  
  openComponents[componentKey] = true;
  return true;
}; 