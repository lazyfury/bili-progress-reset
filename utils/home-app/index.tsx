import { createRoot, type Root } from 'react-dom/client';
import { biliTvSvg } from '../icons';
import { PILL_CSS } from './css';
import { HomeApp, type HomeAppProps } from './HomeApp';

export interface HomeMount {
  update: (props: HomeAppProps) => void;
  unmount: () => void;
}

/** 把 React 应用挂到 host（host 内部用 Shadow DOM 隔离样式） */
export function mountHome(host: HTMLElement, props: HomeAppProps): HomeMount {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const root: Root = createRoot(shadow);
  root.render(<HomeApp {...props} />);
  return {
    update: (p) => root.render(<HomeApp {...p} />),
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

/** 常驻「我的首页」小圆钮（未进入自定义首页时可见） */
export function createPill(onClick: () => void): HTMLElement {
  const pill = document.createElement('div');
  pill.id = 'bpr-home-pill';
  const ps = pill.attachShadow({ mode: 'open' });
  ps.innerHTML = `<style>${PILL_CSS}</style><button>${biliTvSvg(16)} 我的首页</button>`;
  ps.querySelector('button')!.addEventListener('click', onClick);
  (document.body || document.documentElement).appendChild(pill);
  return pill;
}

export { HomeApp } from './HomeApp';
export type { HomeAppProps } from './HomeApp';
