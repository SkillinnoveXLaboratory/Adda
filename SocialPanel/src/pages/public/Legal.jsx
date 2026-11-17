import { useParams } from 'react-router';
import { PublicLayout } from '../../layout/PublicLayout.jsx';
import { LEGAL } from '../../lib/legal.js';

const Mail = () => (
  <a className="font-semibold text-azea-purple" href={`mailto:${LEGAL.email}`}>
    {LEGAL.email}
  </a>
);
const Phone = () => (
  <a className="font-semibold text-azea-purple" href={`tel:+91${LEGAL.phone}`}>
    {LEGAL.phoneDisplay}
  </a>
);
const Who = () => (
  <>
    {LEGAL.brand} is operated by <b>{LEGAL.legalName}</b> (“we”, “us”).
  </>
);

/** Policy texts. Plain language; the operator should review them with their own adviser. */
const PAGES = {
  contact: {
    title: 'Contact us',
    body: (
      <>
        <p>
          <Who />
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr]">
          <dt className="font-semibold text-gray-700">Legal name</dt>
          <dd>{LEGAL.legalName}</dd>
          <dt className="font-semibold text-gray-700">Email</dt>
          <dd>
            <Mail />
          </dd>
          <dt className="font-semibold text-gray-700">Phone</dt>
          <dd>
            <Phone />
          </dd>
          <dt className="font-semibold text-gray-700">Support hours</dt>
          <dd>Monday to Saturday, 10:00 am – 6:00 pm (India time)</dd>
        </dl>
        <p className="mt-4">We reply to emails within 2 working days.</p>
      </>
    ),
  },
  terms: {
    title: 'Terms & Conditions',
    body: (
      <>
        <p>
          <Who /> These terms apply to the {LEGAL.brand} website, the Society Admin panel and the {LEGAL.brand} mobile app (together, the “Service”). By using the Service you agree to them.
        </p>
        <h2>What the Service does</h2>
        <p>
          {LEGAL.brand} is software for housing societies: residents, maintenance bills and receipts, complaints, notices, facility bookings, visitors and a marketplace where independent vendors offer
          services to members.
        </p>
        <h2>Accounts</h2>
        <p>You must give correct details and keep your password private. Society admins are responsible for the people they add to their society. We may suspend accounts that misuse the Service.</p>
        <h2>Payments</h2>
        <p>
          Maintenance and other society dues are owed to your society, not to {LEGAL.brand}. Where online payment is offered, it is processed by a licensed payment gateway; we do not store card or bank
          login details. Services booked from vendors are provided by those vendors, who are responsible for their work.
        </p>
        <h2>Acceptable use</h2>
        <p>Do not post unlawful, false or offensive content, try to access data you are not allowed to see, or disrupt the Service.</p>
        <h2>Liability</h2>
        <p>
          We work to keep the Service accurate and available but provide it “as is”. To the extent the law allows, we are not liable for indirect losses, or for disputes between residents, societies and
          vendors.
        </p>
        <h2>Changes and law</h2>
        <p>We may update these terms; the date below shows the latest version. These terms are governed by the laws of India.</p>
        <p>
          Questions: <Mail /> · <Phone />
        </p>
      </>
    ),
  },
  privacy: {
    title: 'Privacy Policy',
    body: (
      <>
        <p>
          <Who /> This policy explains what personal data we collect and how we use it.
        </p>
        <h2>What we collect</h2>
        <p>
          Name, mobile number, email, flat and society details, records you create (complaints, bookings, visitors, payments), and for vendors the verification details they submit (KYC). Payment card
          and bank login details are handled by the payment gateway, not by us.
        </p>
        <h2>How we use it</h2>
        <p>To run the Service: sign-in, billing and receipts, notifications, society administration, visitor management and vendor bookings; and to keep the Service secure.</p>
        <h2>Who can see it</h2>
        <p>
          Your society’s admins and staff see what they need to manage the society. Vendors see the booking details you send them. Verification documents are encrypted and visible only to authorised
          platform staff. We do not sell personal data.
        </p>
        <h2>Security and retention</h2>
        <p>Data is sent over encrypted connections, access is role-based and audited. Financial records are kept as required by law.</p>
        <h2>Your choices</h2>
        <p>
          You can update your profile in the app. To request a copy or deletion of your data, contact us at <Mail />.
        </p>
      </>
    ),
  },
  refunds: {
    title: 'Refund & Cancellation Policy',
    body: (
      <>
        <p>
          <Who />
        </p>
        <h2>Society dues</h2>
        <p>
          Maintenance and other dues are paid to your society. If you paid twice or paid a wrong amount, contact your society office or write to us at <Mail /> within 7 days of the payment with the
          receipt number. After the society confirms, the refund is sent back to the original payment method, normally within 5–7 working days.
        </p>
        <h2>Failed payments</h2>
        <p>If money was deducted but the payment failed, the payment gateway reverses it automatically, normally within 5–7 working days. If it does not, contact us with the transaction details.</p>
        <h2>Vendor service bookings</h2>
        <p>
          You can cancel a booking in the app before the vendor completes it, free of charge. Services are paid directly to the vendor after the work is done; any refund for such payments is between you
          and the vendor, and we will help resolve disputes raised at <Mail />.
        </p>
        <h2>Subscriptions</h2>
        <p>Society subscriptions, if any, can be cancelled before the next billing period; fees already paid for the current period are not refunded unless required by law.</p>
      </>
    ),
  },
  shipping: {
    title: 'Shipping & Delivery Policy',
    body: (
      <>
        <p>
          <Who />
        </p>
        <p>
          {LEGAL.brand} provides software services only. Nothing is shipped. Access to the Service is delivered online right after sign-up or approval, and payment receipts are available instantly in
          the app and the Society Admin panel. Services booked from vendors are delivered by those vendors at the address and date agreed in the booking.
        </p>
        <p>
          Questions: <Mail /> · <Phone />
        </p>
      </>
    ),
  },
};

export default function Legal({ page: fixed }) {
  const params = useParams();
  const p = PAGES[fixed || params.page] || PAGES.contact;
  return (
    <PublicLayout variant="wide" title={p.title} subtitle={`Last updated ${LEGAL.updated}`}>
      <article className="legal-page mx-auto max-w-3xl rounded-xl bg-white p-5 text-sm leading-relaxed text-gray-700 shadow-sm sm:p-8" data-testid="legal-page">
        {p.body}
      </article>
    </PublicLayout>
  );
}
