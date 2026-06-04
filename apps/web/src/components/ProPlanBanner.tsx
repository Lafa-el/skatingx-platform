import { Link } from "react-router-dom";

type ProPlanBannerProps = {
  isPro: boolean;
  isEn: boolean;
  className?: string;
};

export function ProPlanBanner({ isPro, isEn, className = "" }: ProPlanBannerProps) {
  if (isPro) {
    return (
      <div
        className={`rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 ${className}`}
      >
        <p className="text-sm font-semibold text-emerald-900">
          {isEn ? "PRO active" : "PRO 已开启"}
        </p>
        <p className="mt-1 text-xs text-emerald-800">
          {isEn
            ? "Advanced routine import and PRO-only sections are unlocked (development flag)."
            : "高阶计划导入与 PRO 专区已解锁（开发开关）。"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 ${className}`}
    >
      <p className="text-sm font-semibold text-amber-900">
        {isEn ? "Free plan" : "免费版"}
      </p>
      <p className="mt-1 text-xs text-amber-800">
        {isEn
          ? "Browse Academy content and redeem catalog rewards. Enable PRO in Settings (dev) for advanced imports."
          : "可浏览学院内容与兑换默认奖励。在设置中开启 PRO（开发）以使用高阶导入。"}
      </p>
      <Link
        to="/settings"
        className="mt-2 inline-block text-xs font-medium text-amber-900 underline"
      >
        {isEn ? "Open Settings" : "打开设置"}
      </Link>
    </div>
  );
}

export function ProLockedCard({
  isEn,
  messageEn,
  messageZh,
  className = "",
}: {
  isEn: boolean;
  messageEn: string;
  messageZh: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 ${className}`}
      role="status"
    >
      <p className="text-sm font-semibold text-amber-900">
        {isEn ? "PRO required" : "需要 PRO"}
      </p>
      <p className="mt-1 text-sm text-amber-800">{isEn ? messageEn : messageZh}</p>
      <Link
        to="/settings"
        className="mt-2 inline-block text-xs font-medium text-amber-900 underline"
      >
        {isEn ? "Enable PRO in Settings (dev)" : "在设置中开启 PRO（开发）"}
      </Link>
    </div>
  );
}
