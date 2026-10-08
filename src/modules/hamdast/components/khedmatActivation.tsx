import Button from '@/common/components/atom/button';
import Modal from '@/common/components/atom/modal';
import Switch from '@/common/components/atom/switch';
import useModal from '@/common/hooks/useModal';
import classNames from '@/common/utils/classNames';
import { useUserInfoStore } from '@/modules/login/store/userInfo';
import Card from '.plasmic/Card';
import axios from 'axios';
import { getCookie } from 'cookies-next';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HamdastSubscriptionPayment, HamdastSubscriptionPaymentRef } from './subscription-payment';

// کارت فعال‌سازی «خدمات و تعرفه‌ها» برای وقتی که ویجت برای بیماران خاموش است.
// فقط خود پزشک آن را می‌بیند (والد این را چک می‌کند) و پرداخت همین‌جا روی پروفایل انجام می‌شود،
// بدون رفتن به پنل خدمات و تعرفه‌ها.

const APP_KEY = 'khedmat';
const APP_NAME = 'خدمات و تعرفه‌ها';
const LOG_URL = 'https://n8n.hosseinzr.ir/webhook/log-webhook';
const SERVICES_URL = 'https://n8n.hosseinzr.ir/webhook/servises';
// خدمات را فقط با user_id برمی‌گرداند؛ ردیف‌های پزشکی که هرگز نخریده center_id ندارند و
// `/servises` برایشان خالی است. تا وقتی این endpoint ساخته نشده، به `/servises` برمی‌گردیم.
const OWNER_PREVIEW_URL = 'https://n8n.hosseinzr.ir/webhook/servises-owner-preview';
const LAUNCHER_URL = 'https://www.paziresh24.com/_/khedmat/launcher/?direct=true';
const HAMDAST_BILLING = `https://hamdast.paziresh24.com/api/v1/apps/${APP_KEY}/billing`;

type Duration = 'monthly' | 'quarterly';
const PLAN_KEYS: Record<Duration, { plain: string; boost: string }> = {
  monthly: { plain: 'w8hfc6rhmvsy8hq', boost: 'hydwltqmnkhz1qq' },
  quarterly: { plain: 'ctnofs131x7fou4', boost: '13ybb2fnk281zis' },
};
// به تومان؛ اگر دریافت پلن‌ها از همدست شکست بخورد همین‌ها نمایش داده می‌شوند.
const FALLBACK_PRICES: Record<string, number> = {
  w8hfc6rhmvsy8hq: 289000,
  hydwltqmnkhz1qq: 387000,
  ctnofs131x7fou4: 689000,
  '13ybb2fnk281zis': 895000,
};

const BENEFITS = ['نمایش خدمات و تعرفه‌ها به بیماران', 'بیماران از روی خدمات شما نوبت می‌گیرند', 'بهبود رتبه‌ی سرچ در پذیرش۲۴'];

// رنگ کارت دعوت. صفحه‌ی پروفایل آبی است و کارت آبی در آن گم می‌شود، پس رنگ‌های متضاد داریم.
// برای مقایسه روی پروفایل: ?preview_khedmat=true&khedmat_theme=amber|green|dark|violet|blue
type ThemeName = 'amber' | 'green' | 'dark' | 'violet' | 'blue';
const DEFAULT_THEME: ThemeName = 'amber';
const THEMES: Record<ThemeName, { card: string; lock: string; title: string; benefit: string; check: string; button: string; link: string }> = {
  amber: {
    card: 'border-amber-300 bg-gradient-to-b from-amber-50 to-orange-100',
    lock: 'text-amber-800/70',
    title: 'text-amber-900',
    benefit: 'text-slate-800',
    check: 'text-amber-600',
    button: '!bg-amber-500 hover:!bg-amber-600 !text-white !border-amber-500',
    link: 'text-amber-800',
  },
  green: {
    card: 'border-emerald-300 bg-gradient-to-b from-emerald-50 to-teal-100',
    lock: 'text-emerald-800/70',
    title: 'text-emerald-800',
    benefit: 'text-slate-800',
    check: 'text-emerald-600',
    button: '!bg-emerald-600 hover:!bg-emerald-700 !text-white !border-emerald-600',
    link: 'text-emerald-800',
  },
  dark: {
    card: 'border-slate-900 bg-gradient-to-b from-slate-800 to-slate-950',
    lock: 'text-slate-400',
    title: 'text-white',
    benefit: 'text-slate-100',
    check: 'text-amber-400',
    button: '!bg-amber-400 hover:!bg-amber-300 !text-slate-900 !border-amber-400',
    link: 'text-amber-300',
  },
  violet: {
    card: 'border-violet-300 bg-gradient-to-b from-violet-50 to-fuchsia-100',
    lock: 'text-violet-800/70',
    title: 'text-violet-800',
    benefit: 'text-slate-800',
    check: 'text-violet-600',
    button: '!bg-violet-600 hover:!bg-violet-700 !text-white !border-violet-600',
    link: 'text-violet-800',
  },
  blue: {
    card: 'border-primary/40 bg-primary/5',
    lock: 'text-slate-500',
    title: 'text-primary',
    benefit: 'text-slate-800',
    check: 'text-green-600',
    button: '',
    link: 'text-primary',
  },
};
// اشتراک تمام‌شده همیشه قرمز است تا با کارت «هرگز نخریده» فرق کند.
const EXPIRED_THEME = {
  card: 'border-rose-300 bg-gradient-to-b from-rose-50 to-red-100',
  lock: 'text-rose-800/70',
  title: 'text-rose-800',
  benefit: 'text-slate-800',
  check: 'text-rose-600',
  button: '!bg-rose-600 hover:!bg-rose-700 !text-white !border-rose-600',
  link: 'text-rose-800',
};

const ChevronIcon = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
);

const toFa = (n: number) => Number(n).toLocaleString('fa-IR');

const formatPrice = (item: any) => {
  const min = Number(item.price_min).toLocaleString('en-US');
  return item.price_max == null || item.price_max === '' ? min : `${min} تا ${Number(item.price_max).toLocaleString('en-US')}`;
};

const fetchServices = async (userId: string, centerId?: string) => {
  try {
    const { data } = await axios.get(OWNER_PREVIEW_URL, { params: { user_id: userId } });
    if (Array.isArray(data) && data.length) return data;
  } catch {}
  if (!centerId) return [];
  try {
    const { data } = await axios.get(SERVICES_URL, { params: { center_id: centerId, user_id: userId } });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const LockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

interface KhedmatActivationProps {
  profileData: Record<string, any>;
  centerId?: string;
  /** خدماتی که والد از قبل دارد؛ اگر نباشد خودش می‌گیرد. */
  services?: any[];
}

export const KhedmatActivation = ({ profileData, centerId, services: givenServices }: KhedmatActivationProps) => {
  const userInfo = useUserInfoStore(state => state.info);
  const userId = String(profileData?.user_id ?? '');
  const [services, setServices] = useState<any[] | null>(givenServices?.length ? givenServices : null);
  // null = هنوز معلوم نیست؛ پزشکی که اشتراک فعال دارد این کارت را نمی‌بیند.
  const [subscription, setSubscription] = useState<{ active: boolean; hadBefore: boolean } | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>(FALLBACK_PRICES);
  const [duration, setDuration] = useState<Duration>('monthly');
  const [boost, setBoost] = useState(true);
  const [paymentMounted, setPaymentMounted] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [activated, setActivated] = useState(false);
  const paymentRef = useRef<HamdastSubscriptionPaymentRef>(null);
  const noIframe = useRef(null);
  const viewLogged = useRef(false);
  const planSheet = useModal();
  const successSheet = useModal();

  const variant: 'never_paid' | 'expired' = subscription?.hadBefore ? 'expired' : 'never_paid';
  const planKey = PLAN_KEYS[duration][boost ? 'boost' : 'plain'];

  const router = useRouter();
  const requestedTheme = String(router?.query?.khedmat_theme ?? '') as ThemeName;
  const theme = variant === 'expired' ? EXPIRED_THEME : THEMES[THEMES[requestedTheme] ? requestedTheme : DEFAULT_THEME];

  // ─── اسکرول افقی ردیف کارت‌ها ───
  // روی دسکتاپ با موس نوار اسکرول (مخفی) و حرکت لمسی نیست؛ پس فلش، کشیدن با موس و چرخ موس هم داریم.
  // صفحه RTL است: «بعدی» یعنی رفتن به چپ و scrollLeft منفی‌تر.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const offset = Math.abs(el.scrollLeft);
    setCanPrev(offset > 4);
    setCanNext(offset + el.clientWidth < el.scrollWidth - 4);
  };

  const scrollStep = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: -direction * 240, behavior: 'smooth' });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || (e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX, left: scrollerRef.current?.scrollLeft ?? 0 };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!drag.current || !el) return;
    const dx = e.clientX - drag.current.x;
    el.scrollLeft = drag.current.left - dx;
  };
  const endDrag = () => {
    drag.current = null;
  };

  const log = (event_group: string, detail?: string) => {
    try {
      fetch(LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          event_group,
          doctor_user_id: profileData?.user_id,
          doctor_slug: profileData?.seo?.slug,
          user_id: userInfo?.id,
          terminal_id: getCookie('terminal_id'),
          // ستون service در جدول لاگ از فیلد «sevice» (با همین املا) پر می‌شود.
          sevice: detail,
        }),
      }).catch(() => {});
    } catch {}
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    if (!givenServices?.length) {
      fetchServices(userId, centerId).then(list => {
        if (!cancelled) setServices(list);
      });
    }
    axios
      .get(`${HAMDAST_BILLING}/subscriptions`, { withCredentials: true })
      .then(({ data }) => {
        if (cancelled) return;
        setSubscription({ active: !!data?.has_active_subscription, hadBefore: (data?.history ?? []).length > 0 });
      })
      .catch(() => !cancelled && setSubscription({ active: false, hadBefore: false }));
    axios
      .get(`${HAMDAST_BILLING}/plans/`, { withCredentials: true })
      .then(({ data }) => {
        if (cancelled) return;
        const fromHamdast: Record<string, number> = {};
        for (const plan of data?.items ?? []) {
          // همدست مبلغ را به ریال می‌دهد
          if (plan?.amount) fromHamdast[plan.key || plan.id] = plan.amount / 10;
        }
        setPrices(prev => ({ ...prev, ...fromHamdast }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, centerId]);

  const sortedServices = useMemo(
    () => [...(services ?? [])].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)),
    [services],
  );

  const visible = !!subscription && !subscription.active && !activated && sortedServices.length > 0;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!visible || !el) return;
    updateArrows();
    // چرخ موس عمودی ردیف را افقی می‌برد؛ وقتی به ته ردیف رسید، صفحه مثل همیشه اسکرول می‌شود.
    // listener بومی با passive:false لازم است تا preventDefault کار کند.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const before = el.scrollLeft;
      el.scrollLeft -= e.deltaY;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', updateArrows);
    };
  }, [visible, sortedServices.length]);

  useEffect(() => {
    if (visible && !viewLogged.current) {
      viewLogged.current = true;
      log('khedmat_activation_view', variant);
    }
  }, [visible]);

  const openPlanSheet = () => {
    log('khedmat_click_activation', variant);
    setPaymentMounted(true);
    planSheet.handleOpen();
  };

  const openEditor = (from: string) => {
    log('khedmat_activation_edit', from);
    window.open(LAUNCHER_URL, '_blank');
  };

  const pay = async () => {
    log('khedmat_activation_pay', planKey);
    setIsPaying(true);
    planSheet.handleClose();
    try {
      const result = await paymentRef.current?.open(planKey);
      if (result?.success) {
        log('khedmat_activation_paid', planKey);
        setActivated(true);
        successSheet.handleOpen();
      }
    } finally {
      setIsPaying(false);
    }
  };

  const priceOf = (d: Duration, withBoost: boolean) => prices[PLAN_KEYS[d][withBoost ? 'boost' : 'plain']];
  const boostExtra = priceOf(duration, true) - priceOf(duration, false);

  const copy =
    variant === 'expired'
      ? { title: 'نمایش خدمات شما متوقف شده است', button: 'برای فعال‌سازی دوباره کلیک کنید' }
      : { title: 'نمایش خدمات به بیماران را فعال کنید', button: 'برای فعال‌سازی کلیک کنید' };

  return (
    <>
      {visible && (
        <div dir="rtl" className="relative w-full">
        <div
          ref={scrollerRef}
          onScroll={updateArrows}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className="flex gap-[7px] w-full overflow-x-auto no-scroll items-stretch py-1 select-none"
        >
          <div className={classNames('flex flex-col gap-2 shrink-0 w-max min-w-[220px] p-3 rounded-2xl border-[1.5px] shadow-sm', theme.card)}>
            <span className={classNames('flex items-center gap-1 text-[10px]', theme.lock)}>
              <LockIcon />
              فقط شما این را می‌بینید
            </span>
            <span className={classNames('font-extrabold text-sm leading-6 whitespace-nowrap', theme.title)}>{copy.title}</span>
            {/* کارت هم‌قد کارت‌های خدمت کشیده می‌شود؛ my-auto فضای اضافه را بالا و پایین ویژگی‌ها پخش می‌کند */}
            <ul className="flex flex-col gap-2.5 my-auto py-1">
              {BENEFITS.map(benefit => (
                <li key={benefit} className={classNames('flex items-center gap-1.5 text-xs whitespace-nowrap', theme.benefit)}>
                  <CheckIcon className={classNames('shrink-0', theme.check)} />
                  {benefit}
                </li>
              ))}
            </ul>
            <Button size="sm" block onClick={openPlanSheet} loading={isPaying} className={classNames('!font-bold', theme.button)}>
              {copy.button}
            </Button>
            <button type="button" onClick={() => openEditor('card')} className={classNames('text-[11px] font-medium py-1', theme.link)}>
              ویرایش خدمات
            </button>
          </div>

          {sortedServices.map((item, index) => (
            // با رنگ واقعی، دقیقاً همان‌طور که بیمار بعد از فعال‌سازی می‌بیند؛ فقط کلیک‌پذیر نیست.
            <div key={item.id ?? index} className="w-[220px] min-w-[220px] shrink-0 pointer-events-none" aria-hidden="true">
              <Card
                tiile={item.service}
                priceMin={formatPrice(item)}
                attributes={item.attributes}
                // «SUPPORT» نشانه‌ی «عکس توسط پشتیبانی» است، نه آدرس عکس
                imageLink={typeof item.image_link === 'string' && item.image_link.startsWith('http') ? item.image_link : undefined}
              />
            </div>
          ))}
        </div>
        {canPrev && (
          <button
            type="button"
            aria-label="خدمات قبلی"
            onClick={() => scrollStep(-1)}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center text-slate-700"
          >
            <ChevronIcon direction="right" />
          </button>
        )}
        {canNext && (
          <button
            type="button"
            aria-label="خدمات بعدی"
            onClick={() => scrollStep(1)}
            className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center text-slate-700"
          >
            <ChevronIcon direction="left" />
          </button>
        )}
        </div>
      )}

      <Modal noHeader {...planSheet.modalProps}>
        <div dir="rtl" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-extrabold text-lg">نمایش خدمات به بیماران</span>
            <span className="text-sm text-slate-600 leading-7">بعد از پرداخت، خدماتی که ثبت کرده‌اید در پروفایلتان به بیماران نمایش داده می‌شود.</span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-slate-700">مدت اشتراک</span>
            <div className="grid grid-cols-2 gap-2.5">
              {(['monthly', 'quarterly'] as Duration[]).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={classNames('flex flex-col items-center gap-1 py-3.5 px-2 rounded-xl border-2 min-h-[72px]', {
                    'border-primary bg-primary/5': duration === d,
                    'border-slate-200 bg-white': duration !== d,
                  })}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-extrabold">{d === 'monthly' ? '۱ ماهه' : '۳ ماهه'}</span>
                    {d === 'quarterly' && <span className="bg-red-100 text-red-700 text-[10px] font-extrabold rounded-full px-2 py-0.5">۲۰٪ تخفیف</span>}
                  </span>
                  <span className="text-sm text-slate-700">{toFa(priceOf(d, boost))} تومان</span>
                </button>
              ))}
            </div>
          </div>

          <div
            className={classNames('flex flex-col gap-2 p-3.5 rounded-xl border-[1.5px]', {
              'border-primary/40 bg-primary/5': boost,
              'border-slate-200 bg-slate-50': !boost,
            })}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Switch checked={boost} onChange={e => setBoost(e.target.checked)} />
                <span className="font-extrabold text-sm cursor-pointer" onClick={() => setBoost(prev => !prev)}>
                  بهبود رتبه‌ی سرچ
                </span>
              </div>
              <span className="text-sm font-bold text-primary">{toFa(boostExtra)}+ تومان</span>
            </div>
            <span className="text-xs text-slate-600 leading-6">وقتی بیماران خدمات شما را جستجو کنند، پروفایل شما بالاتر نمایش داده می‌شود.</span>
          </div>

          <div className="h-px bg-slate-200" />

          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 font-medium">مبلغ قابل پرداخت</span>
            <span className="text-xl font-extrabold text-primary">{toFa(prices[planKey])} تومان</span>
          </div>

          <Button block onClick={pay} loading={isPaying} className="!font-extrabold">
            پرداخت و نمایش خدمات
          </Button>
          <button type="button" onClick={() => openEditor('plan_sheet')} className="text-sm font-medium text-primary py-1">
            اول خدماتم را ویرایش می‌کنم
          </button>
        </div>
      </Modal>

      <Modal noHeader {...successSheet.modalProps}>
        <div dir="rtl" className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckIcon className="text-green-700 w-8 h-8" />
          </div>
          <span className="font-extrabold text-lg">خدمات شما فعال شد</span>
          <span className="text-sm text-slate-600 leading-7">تا چند دقیقه‌ی دیگر خدمات و تعرفه‌های شما در پروفایلتان به بیماران نمایش داده می‌شود.</span>
          <div className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-right">
            <span className="flex flex-col gap-0.5">
              <span className="font-bold text-sm">برای خدماتتان عکس بگذارید</span>
              <span className="text-xs text-slate-600">کارت‌های عکس‌دار بیشتر دیده می‌شوند.</span>
            </span>
          </div>
          <Button block onClick={() => openEditor('success')} className="!font-extrabold">
            افزودن عکس و ویرایش خدمات
          </Button>
          <Button block variant="text" onClick={successSheet.handleClose}>
            بستن
          </Button>
        </div>
      </Modal>

      {/* فقط بعد از کلیک پزشک mount می‌شود؛ این کامپوننت به پیام‌های پرداخت همه‌ی iframeهای صفحه گوش می‌دهد
          و نباید روی پروفایل همیشه روشن باشد. */}
      {paymentMounted && <HamdastSubscriptionPayment ref={paymentRef} app_key={APP_KEY} app_name={APP_NAME} icon="" iframeRef={noIframe} />}
    </>
  );
};

export default KhedmatActivation;
