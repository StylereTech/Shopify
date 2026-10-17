import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { MissingOrder, ReadError, SessionNotice } from '../components/customer/CustomerUI';
import { useCustomerSession } from '../context/useCustomerSession';
import { customerApi } from '../api/client';
import { customerRecordUnavailable, dateTime, readOrderLocation, trackingPath } from '../lib/customerPageState';

export function Chat() {
  const session = useCustomerSession();
  const { orderId: value } = useParams();
  const orderId = readOrderLocation('', value);
  return <AppShell title="Delivery support" showBack backTo={orderId ? trackingPath(orderId) : '/orders'}><SessionNotice session={session} />{!orderId ? <MissingOrder /> : session.status === 'ready' && <ChatStatus key={session.key + ':' + orderId} session={session} orderId={orderId} />}</AppShell>;
}
function ChatStatus({ session, orderId }: { session: ReturnType<typeof useCustomerSession>; orderId: string }) {
  const query = useQuery({ queryKey: ['customer-chat', session.key, orderId], queryFn: ({ signal }) => customerApi(session).getChat(orderId, signal), retry: false, refetchOnMount: 'always' });
  const data = query.isFetchedAfterMount && !customerRecordUnavailable(query.error) ? query.data : undefined;
  return <div className="customer-stack">
    {!query.isFetchedAfterMount && !query.isError && <p role="status">Checking delivery support…</p>}
    {query.isError && <ReadError session={session} error={query.error} retry={() => query.refetch()} />}
    {data && <><div className="customer-notice" data-tone="info"><h2>Courier chat is not connected</h2><p>Messages cannot be sent to your courier from this page. Contact support and include order {orderId} for help.</p><Link className="customer-button" to="/support">View support options</Link></div>
      {data.messages.length > 0 && <section className="customer-card"><h2>Recorded messages</h2>{data.messages.map(message => <div key={message.id}><p>{message.message}</p><p className="customer-muted">{message.sender} · {dateTime(message.timestamp)}</p></div>)}</section>}
      <Link to={trackingPath(orderId)}>Return to order updates</Link>
    </>}
  </div>;
}
