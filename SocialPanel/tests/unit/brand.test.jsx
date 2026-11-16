import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SocietyBrand } from '../../src/components/SocietyBrand.jsx';

describe('SocietyBrand', () => {
  it('shows the initials tile when there is no logo', () => {
    render(<SocietyBrand name="Green Meadows CHS" />);
    expect(screen.getByTestId('society-initials')).toHaveTextContent('GM');
    expect(screen.getByText('Green Meadows CHS')).toBeInTheDocument();
    expect(screen.getByTestId('society-brand')).toHaveAttribute('title', 'Green Meadows CHS');
  });
  it('shows the logo, and falls back to initials when it fails to load', () => {
    render(<SocietyBrand name="Sunrise Towers" logoUrl="/media/logo.png" />);
    const img = screen.getByTestId('society-logo');
    expect(img).toHaveAttribute('alt', 'Sunrise Towers logo');
    expect(img.getAttribute('src')).toMatch(/\/media\/logo\.png$/);
    fireEvent.error(img);
    expect(screen.getByTestId('society-initials')).toHaveTextContent('ST');
  });
});
