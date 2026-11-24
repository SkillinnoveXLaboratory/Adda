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
          <Who /> This policy covers the {LEGAL.brand} mobile app for Android (package <b>com.nivasa.app</b>), the Society Admin panel and the {LEGAL.brand} website (together, the “Service”). It
          explains what personal data we collect, why, who can see it, how long we keep it and the choices you have. By using the Service you agree to this policy.
        </p>

        <h2>Who uses the app</h2>
        <p>
          <b>Members</b> (residents of a housing society), <b>vendors</b> (independent service providers and sellers) and <b>gate staff</b> (security guards working for a society) use the app.
          Society staff and the {LEGAL.brand} team use the web panels. The data we collect depends on which of these you are.
        </p>

        <h2>Information you give us</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Account:</b> your name, mobile number, password (stored only as a one-way hash), and optionally your email address and city.
          </li>
          <li>
            <b>Society membership (members):</b> your society, building, flat number and whether you are an owner or tenant.
          </li>
          <li>
            <b>What you create:</b> complaints and the photos you attach, community posts, facility and service bookings, poll votes, guest / visitor entries, product orders and delivery addresses,
            listings (properties, items, services, products) and their photos.
          </li>
          <li>
            <b>Vendors — shop and verification (KYC):</b> shop name, logo and location; business name and type; PAN, Aadhaar number, bank account holder, account number, IFSC and bank name; and photos of the
            PAN card and Aadhaar (front and back). PAN, Aadhaar and bank account numbers are stored encrypted, and the document photos are private files.
          </li>
          <li>
            <b>Visitors:</b> when a member or a gateman registers a guest, we store the guest’s name, mobile number, purpose and entry / exit times so the society can manage its gate.
          </li>
        </ul>

        <h2>Information collected when you use the app</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Location (only when you allow it, only while the app is open):</b> used to show services and products “near me” and to set a vendor’s shop location on the map. We do not track your location in
            the background and we do not keep a history of where you have been. A vendor’s shop location is stored so members can find the shop.
          </li>
          <li>
            <b>Camera and photos (only when you choose to attach a picture):</b> used to take or pick photos for complaints, posts, listings, products, your shop logo and KYC documents. Only the photos you
            pick are uploaded.
          </li>
          <li>
            <b>Files:</b> when you pick a document (for example a PDF), only that file is uploaded.
          </li>
          <li>
            <b>Phone calls and WhatsApp:</b> “Call” and “WhatsApp” buttons open your phone’s dialer or WhatsApp with the number filled in. The app does not read your contacts or your call log.
          </li>
          <li>
            <b>Technical data:</b> sign-in sessions (device name you give, IP address, time), security and audit logs of important actions, and basic error logs needed to keep the Service working and safe.
            Sign-in tokens are kept in the secure storage of your phone.
          </li>
        </ul>
        <p>The app does not use your microphone, does not read your contacts, SMS or call logs, and does not show third-party advertising.</p>

        <h2>Payments</h2>
        <p>
          Online payments (maintenance dues, facility fees, service bookings and product orders) are processed by our payment partner <b>Cashfree Payments</b>. You enter your card, UPI or bank details on
          Cashfree’s secure page — {LEGAL.brand} never receives or stores them. We keep the payment records we need (amount, status, payment reference, date) for receipts, refunds and accounting. To pay
          vendors their share, we share a vendor’s name, email, mobile number, bank account details and PAN with Cashfree to create their payout account. Cash payments recorded by your society or a vendor
          are stored in the same way.
        </p>

        <h2>How we use your information</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>To create and secure your account and let you sign in.</li>
          <li>To run your society: membership approval, bills and receipts, complaints, notices, polls, facility bookings and the guest / visitor log.</li>
          <li>To run the marketplace: show listings, take bookings and orders, deliver orders, calculate prices, commissions, discounts and vendor earnings.</li>
          <li>To verify vendors (KYC) and pay them through Cashfree.</li>
          <li>To send in-app notifications about your bookings, orders, payments, visitors and society notices.</li>
          <li>To prevent fraud and misuse, keep audit records, and meet legal and tax obligations.</li>
        </ul>
        <p>We do not sell your personal data and we do not use it for advertising.</p>

        <h2>Who can see your information</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Your society’s admins and staff</b> see the member, flat, billing, complaint, booking and visitor information they need to manage the society. Gate staff see the residents’ names and flat
            numbers and the guests expected at the gate.
          </li>
          <li>
            <b>Vendors</b> see the name, mobile number, address and note of a member who books their service or orders their product — only for that booking or order.
          </li>
          <li>
            <b>Members</b> see a vendor’s shop name, logo, listings and contact number. Your society’s community posts are visible to members of the same society.
          </li>
          <li>
            <b>The {LEGAL.brand} team</b> (authorised administrators only) can see account and vendor verification details to run and support the Service. Full PAN, Aadhaar and account numbers are
            shown only to authorised staff on request, and every such view is recorded.
          </li>
          <li>
            <b>Service providers</b> that host and run the Service for us: cloud hosting and database, payments (Cashfree), and maps / address search (OpenStreetMap). They may only use the data to provide
            their service to us.
          </li>
          <li>
            <b>Authorities</b>, when required by law or to protect the rights and safety of users.
          </li>
        </ul>

        <h2>Security</h2>
        <p>
          Data travels over encrypted connections (HTTPS). Passwords are stored as one-way hashes. Vendor PAN, Aadhaar and bank account numbers are encrypted at rest (AES-256), and KYC photos are private files
          that open only through short-lived links for authorised staff. Access inside the Service is role-based, each society’s data is kept separate, and important actions are recorded in a tamper-evident
          audit log.
        </p>

        <h2>How long we keep data</h2>
        <p>
          We keep your account data while your account is active. Payment, billing, receipt and ledger records are kept for as long as Indian tax and accounting laws require, even after an account is
          closed. Visitor logs are kept while your society uses {LEGAL.brand}; a society can ask us to delete older logs. Other data is deleted or anonymised within 30 days after you ask us to delete your
          account, except where we must keep it by law or to resolve a dispute.
        </p>

        <h2 id="delete-account">Delete your account or data</h2>
        <p>
          You can update your name, email and city in the app’s profile. To delete your account and personal data, email <Mail /> from the email on your account, or call <Phone />, with the subject
          “Delete my NIVASA account” and your registered mobile number. We confirm the request with you, then delete your account within 30 days (keeping only the records the law requires, as explained
          above). You can also ask us for a copy of your data or to correct it in the same way.
        </p>

        <h2>Children</h2>
        <p>The Service is meant for adults (18+). We do not knowingly create accounts for children. If you believe a child has given us personal data, contact us and we will delete it.</p>

        <h2>Changes to this policy</h2>
        <p>We may update this policy. The date at the top shows the latest version. If a change affects how we use your data in an important way, we will tell you in the app or by email.</p>

        <h2>Contact</h2>
        <p>
          {LEGAL.legalName} ({LEGAL.brand}) · <Mail /> · <Phone />
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
