import { passwordProblems, passwordStrength } from '../lib/validation.js';
import { cx, Icon } from './ui.jsx';
import { Field, PasswordInput } from './Form.jsx';

const LEVELS = [
  ['Too weak', 'bg-rose-400', 'text-rose-600'],
  ['Weak', 'bg-orange-400', 'text-orange-600'],
  ['Good', 'bg-amber-400', 'text-amber-700'],
  ['Strong', 'bg-emerald-400', 'text-emerald-700'],
  ['Very strong', 'bg-emerald-500', 'text-emerald-700'],
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

/** New password + confirm, with the rules shown and a strength meter. */
export function PasswordFields({ password, confirm, onPassword, onConfirm, errors = {}, label = 'Password' }) {
  const strength = passwordStrength(password);
  const rules = [
    ['At least 10 characters', password.length >= 10],
    ['Contains a letter', /[A-Za-z]/.test(password)],
    ['Contains a number', /\d/.test(password)],
  ];
  return (
    <div className="space-y-3">
      <Field label={label} error={errors.password} htmlFor="new-password">
        <PasswordInput id="new-password" name="password" autoComplete="new-password" value={password} onChange={(e) => onPassword(e.target.value)} invalid={Boolean(errors.password)} placeholder="At least 10 letters and numbers" maxLength={200} />
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
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-3" aria-label="Password rules">
        {rules.map(([text, ok]) => (
          <li key={text} className={cx('flex items-center gap-1.5 text-[11px]', ok ? 'text-emerald-700' : 'text-gray-500')}>
            <Icon name={ok ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'} className="text-[10px]" />
            {text}
          </li>
        ))}
      </ul>
      <Field label="Confirm password" error={errors.confirm} htmlFor="confirm-password">
        <PasswordInput id="confirm-password" name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} invalid={Boolean(errors.confirm)} placeholder="Type it again" maxLength={200} />
      </Field>
    </div>
  );
}
