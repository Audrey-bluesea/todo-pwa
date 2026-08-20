interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const base = (size: number, className?: string, strokeWidth = 1.8) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
});

export const IconChecklist = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M3.5 6.5l1.6 1.6L8.3 5" />
    <path d="M3.5 12.5l1.6 1.6L8.3 11" />
    <path d="M3.5 18.5l1.6 1.6L8.3 17" />
    <path d="M11.5 7h9M11.5 13h9M11.5 19h6" />
  </svg>
);

export const IconCalendar = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <rect x="3" y="5" width="18" height="16" rx="3.5" />
    <path d="M3 9.5h18M8 3v4M16 3v4" />
    <circle cx="8.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconMenu = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M4 7h16M4 12h11M4 17h16" />
  </svg>
);

export const IconPlus = ({ size = 24, className, strokeWidth = 2.2 }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconSearch = ({ size = 24, className, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-3.6-3.6" />
  </svg>
);

export const IconClose = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconChevronDown = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M6 9.5l6 6 6-6" />
  </svg>
);

export const IconChevronLeft = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M14.5 5.5l-7 6.5 7 6.5" />
  </svg>
);

export const IconChevronRight = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M9.5 5.5l7 6.5-7 6.5" />
  </svg>
);

export const IconBoard = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <rect x="3" y="4" width="6" height="16" rx="2" />
    <rect x="13" y="4" width="6" height="10" rx="2" />
  </svg>
);

export const IconList = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </svg>
);

export const IconTrash = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M4 7h16M10 4h4M6 7l1 12.5A2 2 0 009 21h6a2 2 0 002-1.5L18 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </svg>
);

export const IconClock = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconInbox = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M4 13l2-7.5A2 2 0 018 4h8a2 2 0 012 1.5L20 13v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z" />
    <path d="M4 13h4l1.2 2.2h5.6L16 13h4" />
  </svg>
);

export const IconCheck = ({ size = 24, className, strokeWidth = 2.4 }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

export const IconSun = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
  </svg>
);

export const IconWeek = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <rect x="3" y="6" width="18" height="12" rx="3" />
    <path d="M9 6v12M15 6v12" />
  </svg>
);

export const IconGrid = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </svg>
);

export const IconEdit = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 10-3-3L5 17v3z" />
  </svg>
);

export const IconDrag = ({ size = 24, className, strokeWidth }: IconProps) => (
  <svg {...base(size, className, strokeWidth)}>
    <circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);
