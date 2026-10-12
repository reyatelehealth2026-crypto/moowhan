import { useEffect, useRef } from 'react';
import Icons from '../../components/Icons.jsx';
import { computeSteps } from './steps.js';

const TARGET = { template: 'upload', sources: 'upload', process: 'upload', review: 'preview', export: 'preview' };

const tone = {
  done: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  current: 'bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-300',
  todo: 'bg-white border-slate-200 text-slate-500',
};

/** Reflects app state as 5 steps (not a second navigation). Scrolls horizontally inside itself on phones. */
export default function StepStrip({ state, actions }) {
  const steps = computeSteps(state, undefined, actions.gate);
  const fd = state.features?.onboarding;

  // demo: runs once the freshly added sample files are in state, then restores the demo notice
  const running = useRef(false);
  useEffect(() => {
    if (!fd?.autoProcess || running.current || !state.sourceFiles.length || state.processing?.active) return;
    running.current = true;
    const notice = fd.demoNotice;
    actions.setFeatureData('onboarding', { autoProcess: false });
    Promise.resolve(actions.processAll())
      .then((r) => { if (r && notice) actions.setNotice(notice, 'warning'); })
      .finally(() => { running.current = false; });
  }, [fd?.autoProcess, state.sourceFiles.length, state.processing?.active]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <nav aria-label="ขั้นตอนการใช้งาน" data-testid="step-strip" className="print:hidden mb-4 max-w-full">
      {state.isDemo && (
        <span data-testid="demo-chip" className="inline-block mb-2 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200">ตัวอย่าง</span>
      )}
      <ol className="flex gap-2 overflow-x-auto pb-1 list-none p-0 m-0">
        {steps.map((s, i) => {
          const clickable = s.status !== 'todo';
          return (
            <li key={s.id} className="flex-shrink-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => actions.goTo?.(TARGET[s.id])}
                aria-current={s.status === 'current' ? 'step' : undefined}
                data-step={s.id}
                data-status={s.status}
                className={`min-w-36 max-w-52 text-left rounded-lg border px-3 py-2 ${tone[s.status]} ${clickable ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="w-4 h-4 flex-shrink-0">{s.status === 'done' ? <Icons.Check /> : <span className="block text-center text-xs leading-4">{i + 1}</span>}</span>
                  <span className="truncate">{s.label}</span>
                </span>
                <span className={`block text-xs mt-0.5 truncate ${s.note === 'warning' ? 'text-amber-700 font-medium' : ''}`} title={s.hint}>{s.hint}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
