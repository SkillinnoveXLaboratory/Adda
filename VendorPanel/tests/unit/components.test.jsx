import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BookingSettlement, CommissionBreakdown, SettlementSummary } from '../../src/components/Pricing.jsx';
import { KycStatusCard } from '../../src/components/KycStatusCard.jsx';

describe('CommissionBreakdown', () => {
  it('shows price, commission and what the vendor earns', () => {
    render(<CommissionBreakdown pricePaise={49900} percent={10} />);
    expect(screen.getByTestId('commission-price')).toHaveTextContent('₹499');
    expect(screen.getByTestId('commission-amount')).toHaveTextContent('− ₹49.90');
    expect(screen.getByTestId('commission-earn')).toHaveTextContent('₹449.10');
    expect(screen.getByText('NIVASA commission (10%)')).toBeInTheDocument();
  });
  it('price on request shows the rate only', () => {
    render(<CommissionBreakdown pricePaise={0} percent={12.5} onQuote />);
    expect(screen.getByTestId('commission-breakdown')).toHaveTextContent('12.5% platform commission');
    expect(screen.queryByTestId('commission-earn')).toBeNull();
  });
  it('no commission configured says so', () => {
    render(<CommissionBreakdown pricePaise={0} percent={0} />);
    expect(screen.getByTestId('commission-breakdown')).toHaveTextContent('No platform commission');
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
