import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '../../src/components/Toast.jsx';
import VendorNew from '../../src/pages/platform/VendorNew.jsx';
import { api } from '../../src/lib/api.js';

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <VendorNew />
      </ToastProvider>
    </MemoryRouter>,
  );

describe('Add vendor page', () => {
  it('shows errors next to the fields and sends nothing while invalid', () => {
    const post = vi.spyOn(api, 'post');
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: /add kyc now/i }));
    expect(screen.getByTestId('kyc-form')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('vendor-create'));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(/full name \(2–120/i)).toBeInTheDocument();
    expect(screen.getByText(/enter the vendor’s mobile number/i)).toBeInTheDocument();
    expect(screen.getByText(/enter the pan/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm that the vendor agreed/i)).toBeInTheDocument();
    post.mockRestore();
  });
  it('closing the KYC section clears what was typed', () => {
    renderPage();
    const toggle = screen.getByRole('switch', { name: /add kyc now/i });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByTestId('kyc-pan'), { target: { value: 'ABCDE1234F' } });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByTestId('kyc-pan')).toHaveValue('');
  });
});
