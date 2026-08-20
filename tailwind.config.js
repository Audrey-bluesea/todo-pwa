/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 🍵 抹茶绿 / 🌊 海边像素 双主题色板 —— 全部走 CSS 变量（RGB 三元组），
        // 实际色值在 src/index.css 的 :root（抹茶）与 [data-theme="pixel"]（海边）中定义。
        primary: {
          50: 'rgb(var(--c-primary-50) / <alpha-value>)',
          100: 'rgb(var(--c-primary-100) / <alpha-value>)',
          200: 'rgb(var(--c-primary-200) / <alpha-value>)',
          300: 'rgb(var(--c-primary-300) / <alpha-value>)',
          400: 'rgb(var(--c-primary-400) / <alpha-value>)',
          500: 'rgb(var(--c-primary-500) / <alpha-value>)',
          600: 'rgb(var(--c-primary-600) / <alpha-value>)',
          700: 'rgb(var(--c-primary-700) / <alpha-value>)',
          800: 'rgb(var(--c-primary-800) / <alpha-value>)',
          900: 'rgb(var(--c-primary-900) / <alpha-value>)',
        },
        neutral: {
          50: 'rgb(var(--c-neutral-50) / <alpha-value>)',
          100: 'rgb(var(--c-neutral-100) / <alpha-value>)',
          200: 'rgb(var(--c-neutral-200) / <alpha-value>)',
          300: 'rgb(var(--c-neutral-300) / <alpha-value>)',
          400: 'rgb(var(--c-neutral-400) / <alpha-value>)',
          500: 'rgb(var(--c-neutral-500) / <alpha-value>)',
          600: 'rgb(var(--c-neutral-600) / <alpha-value>)',
          700: 'rgb(var(--c-neutral-700) / <alpha-value>)',
          800: 'rgb(var(--c-neutral-800) / <alpha-value>)',
        },
        // 语义令牌（主题可切换）
        accent: 'rgb(var(--c-accent) / <alpha-value>)', // 沙漏黄 / 逾期强调
        success: 'rgb(var(--c-success) / <alpha-value>)', // 海藻绿 / 已完成
        ink: 'rgb(var(--c-ink) / <alpha-value>)', // 正文深色
        borderc: 'rgb(var(--c-border) / <alpha-value>)', // 像素边框墨蓝
        muted: 'rgb(var(--c-muted) / <alpha-value>)', // 辅助灰
        appbg: 'rgb(var(--c-appbg) / <alpha-value>)', // 全局背景
      },
      boxShadow: {
        // 阴影改由 CSS 变量驱动，主题切换时整体替换
        card: 'var(--shadow-card)',
        'card-soft': 'var(--shadow-card-soft)',
        fab: 'var(--shadow-fab)',
        sheet: 'var(--shadow-sheet)',
        drawer: 'var(--shadow-drawer)',
      },
      borderRadius: {
        // 圆角整尺度统一为变量：抹茶 16px / 像素 4px。保留 none 与 full（圆形不变量）
        none: '0',
        DEFAULT: 'var(--px-radius, 16px)',
        sm: 'var(--px-radius, 16px)',
        md: 'var(--px-radius, 16px)',
        lg: 'var(--px-radius, 16px)',
        xl: 'var(--px-radius, 16px)',
        '2xl': 'var(--px-radius, 16px)',
        '3xl': 'var(--px-radius, 16px)',
        card: 'var(--px-radius, 16px)',
        full: '9999px',
      },
      backdropBlur: {
        glass: '16px',
        sheet: '20px',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        pixel: ['"Press Start 2P"', '"VT323"', 'monospace'],
        fun: ['"ZCOOL KuaiLe"', '"Press Start 2P"', 'monospace'],
      },
      transitionTimingFunction: {
        ios: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};
