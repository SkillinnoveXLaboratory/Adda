import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BookingSettlement, CommissionHint, SettlementSummary } from '../../src/components/Pricing.jsx';
import { KycStatusCard } from '../../src/components/KycStatusCard.jsx';

describe('CommissionHint', () => {
  it('says the commission is taken when the customer pays, with no amounts', () => {
    render(<MemoryRouter><CommissionHint percent={10} /></MemoryRouter>);
    const hint = screen.getByTestId('commission-hint');
    expect(hint).toHaveTextContent('NIVASA’s commission (10%) is taken from each payment when the customer pays — see Earnings.');
    expect(hint).not.toHaveTextContent('₹');
    expect(screen.getByRole('link', { name: 'Earnings' })).toHaveAttribute('href', '/earnings');
  });
  it('shows nothing when no commission is charged', () => {
    const { container } = render(<MemoryRouter><CommissionHint percent={0} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('settlement', () => {
  it('dashboard totals: you owe NIVASA when commission exceeds coupon credits', () => {
    render(<SettlementSummary settlement={{ paidBookings: 2, cashCollectedPaise: 90000, couponCreditsPaise: 5000, commissionPaise: 9500, netToPlatformPaise: 4500 }} commissionPercent={10} />);
    expect(screen.getByTestId('settle-cash')).toHaveTextContent('₹900');
    expect(screen.getByTestId('settle-net')).toHaveTextContent('₹45');
    expect(screen.getByText('You owe NIVASA')).toBeInTheDocument();
  });
  it('dashboard totals: NIVASA owes you when coupons exceed commission', () => {
    render(<SettlementSummary settlement={{ paidBookings: 1, cashCollectedPaise: 10000, couponCreditsPaise: 5000, commissionPaise: 1500, netToPlatformPaise: -3500 }} />);
    expect(screen.getByText('NIVASA owes you')).toBeInTheDocument();
    expect(screen.getByTestId('settle-net')).toHaveTextContent('₹35');
  });
  it('per booking: only for paid bookings with vendor fields', () => {
    const { container } = render(<BookingSettlement payment={{ status: 'unpaid' }} />);
    expect(container).toBeEmptyDOMElement();
    render(<BookingSettlement payment={{ status: 'paid', amountPaise: 44900, discountPaise: 5000, grossPaise: 49900, commissionPaise: 4990, netToPlatformPaise: -10 }} />);
    expect(screen.getByTestId('booking-net')).toHaveTextContent('₹0.10');
    expect(screen.getByText('NIVASA owes you')).toBeInTheDocument();
  });
});

describe('KycStatusCard', () => {
  it('links to KYC until approved and shows the rejection reason', () => {
    render(
      <MemoryRouter>
        <KycStatusCard status="rejected" note="PAN photo is blurred" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Reason: PAN photo is blurred')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Fix and resubmit/ })).toHaveAttribute('href', '/kyc');
  });
  it('renders nothing once approved', () => {
    const { container } = render(
      <MemoryRouter>
        <KycStatusCard status="approved" />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
