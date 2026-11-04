import { useState } from 'react';
import { passwordProblems, passwordStrength } from '../lib/validation.js';
import { cx, Icon } from './ui.jsx';
import { Field, Input } from './Form.jsx';

const LEVELS = [
  ['Too weak', 'bg-rose-400', 'text-rose-500'],
  ['Weak', 'bg-orange-400', 'text-orange-500'],
  ['Good', 'bg-amber-400', 'text-amber-600'],
  ['Strong', 'bg-emerald-400', 'text-emerald-600'],
  ['Very strong', 'bg-emerald-500', 'text-emerald-600'],
];

/** Validates both fields; returns an errors object (empty when OK). */
export function validatePasswords(password, confirm) {
  const errors = {};
  const problems = passwordProblems(password);
  if (problems.length) errors.password = `Password needs: ${problems.join(', ').toLowerCase()}`;
  if (!confirm) errors.confirm = 'Re-enter the password';
  else if (confirm !== password) errors.confirm = 'Passwords do not match';
  return errors;
}

export function PasswordFields({ password, confirm, onPassword, onConfirm, errors = {} }) {
  const [show, setShow] = useState(false);
  const strength = passwordStrength(password);
  const rules = [
    ['At least 10 characters', password.length >= 10],
    ['Contains a letter', /[A-Za-z]/.test(password)],
    ['Contains a number', /\d/.test(password)],
  ];
  return (
    <div className="space-y-4">
      <Field label="New password" error={errors.password} htmlFor="new-password">
        <div className="relative">
          <Input id="new-password" name="password" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => onPassword(e.target.value)} invalid={Boolean(errors.password)} className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-brand" aria-label={show ? 'Hide password' : 'Show password'}>
            <Icon name={show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} className="text-xs" />
          </button>
        </div>
      </Field>
      {password && (
        <div aria-live="polite">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cx('h-1 flex-1 rounded-full', i < Math.max(strength, 1) ? LEVELS[strength][1] : 'bg-gray-100')} />
            ))}
          </div>
          <p className={cx('mt-1 text-[11px] font-semibold', LEVELS[strength][2])}>{LEVELS[strength][0]}</p>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-3">
        {rules.map(([label, ok]) => (
          <li key={label} className={cx('flex items-center gap-1.5 text-[11px]', ok ? 'text-emerald-600' : 'text-gray-400')}>
            <Icon name={ok ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'} className="text-[10px]" />
            {label}
          </li>
        ))}
      </ul>
      <Field label="Confirm password" error={errors.confirm} htmlFor="confirm-password">
        <Input id="confirm-password" name="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} invalid={Boolean(errors.confirm)} />
      </Field>
    </div>
  );
}
