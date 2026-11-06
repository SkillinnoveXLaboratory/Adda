import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DetailHeader, EmptyState, ErrorState, LoadingList, T, TextLink } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { colors } from '../../theme';

const ICON = { membership: 'people', announcement: 'megaphone', complaint: 'construct', bill: 'receipt', payment: 'wallet', reminder: 'alarm', booking: 'calendar', service: 'build', listing: 'pricetag', community: 'chatbubbles', system: 'information-circle', vendor: 'shield-checkmark', ad: 'rocket' };

/** Maps the server's notification route hint to an app screen. */
function hrefFor(n, isMember, isVendor) {
  const id = n.data?.id;
  const r = n.data?.route;
  if (isVendor) {
    const vendorRoutes = { MyProperties: '/vendor-listings?tab=property', MyServices: '/vendor-listings?tab=service', VendorBookings: '/vendor-bookings', VendorAds: '/ads', VendorKyc: '/kyc' };
    return vendorRoutes[r] || null;
  }
  if (r === 'MyServiceBookings') return '/service-bookings';
  if (!isMember && !['MyProperties', 'MyMarketplace', 'MyServices'].includes(r)) return null;
  switch (r) {
    case 'Invoice':
      return id ? `/invoice/${id}` : '/bills';
    case 'Receipt':
      return id ? `/receipt/${id}` : '/payments';
    case 'ComplaintDetail':
      return id ? `/complaints/${id}` : '/complaints';
    case 'NoticeDetail':
      return id ? `/notices/${id}` : '/notices';
    case 'PostDetail':
      return id ? `/posts/${id}` : '/community';
    case 'Bookings':
      return '/bookings';
    case 'ServiceRequests':
      return '/service-requests';
    case 'Payments':
      return '/payments';
    case 'Community':
      return '/community';
    case 'MyProperties':
      return '/my-listings?tab=property';
    case 'MyMarketplace':
      return '/my-listings?tab=marketplace';
    case 'MyServices':
      return '/my-listings?tab=service';
    case 'Home':
      return '/home';
    default:
      return null;
  }
}

export default function Notifications() {
  const { isMember, isVendor, refreshProfile } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ items: [], unread: 0, page: 0, pages: 1, loading: true, refreshing: false, more: false, error: null });
  const pageRef = useRef(0);

  const load = useCallback(async (mode = 'reset') => {
    const page = mode === 'more' ? pageRef.current + 1 : 1;
    setState((s) => ({ ...s, error: null, refreshing: mode === 'refresh', more: mode === 'more' }));
    try {
      const r = await api('/notifications', { query: { page, limit: 25 } });
      pageRef.current = r.page;
      setState((s) => ({ ...s, items: page === 1 ? r.items : [...s.items, ...r.items], unread: r.unread, page: r.page, pages: r.pages, loading: false, refreshing: false, more: false }));
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false, refreshing: false, more: false }));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = async (n) => {
    if (!n.readAt) {
      setState((s) => ({ ...s, unread: Math.max(0, s.unread - 1), items: s.items.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)) }));
      api(`/notifications/${n._id}/read`, { method: 'POST' }).catch(() => {});
    }
    if (n.type === 'membership') {
      // Approvals change what the user can access — refresh the session profile first.
      await refreshProfile().catch(() => {});
      return router.replace('/');
    }
    // A KYC decision changes what a vendor can do — refresh the profile first.
    if (n.type === 'vendor') await refreshProfile().catch(() => {});
    const href = hrefFor(n, isMember, isVendor);
    if (href) router.push(href);
  };

  const readAll = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setState((s) => ({ ...s, unread: 0, items: s.items.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })) }));
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DetailHeader title="Notifications" fallback="/" right={state.unread ? <TextLink title="Read all" onPress={readAll} size={12.5} style={{ paddingHorizontal: 8 }} /> : null} />
      {state.loading ? (
        <View style={{ padding: 16 }}>
          <LoadingList rows={5} card={64} />
        </View>
      ) : state.error && !state.items.length ? (
        <ErrorState error={state.error} onRetry={() => load()} />
      ) : (
        <FlatList
          data={state.items}
          keyExtractor={(n) => n._id}
          renderItem={({ item: n }) => (
            <Pressable onPress={() => open(n)} accessibilityRole="button" accessibilityLabel={`${n.title}${n.readAt ? '' : ', unread'}`} style={({ pressed }) => [{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, backgroundColor: n.readAt ? colors.white : '#f1f5f9', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }, pressed && { opacity: 0.85 }]}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={`${ICON[n.type] || 'notifications'}-outline`} size={19} color="#07162c" />
              </View>
              <View style={{ flex: 1 }}>
                <T weight={n.readAt ? 'semibold' : 'extrabold'} size={14}>
                  {n.title}
                </T>
                {n.body ? (
                  <T size={13} color={colors.muted} numberOfLines={2}>
                    {n.body}
                  </T>
                ) : null}
                <T size={11.5} color={colors.subtle} style={{ marginTop: 2 }}>
                  {timeAgo(n.createdAt)}
                </T>
              </View>
              {!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#b38a2e' }} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon="notifications-off-outline" title="No notifications yet" message="Bills, approvals, complaint updates and notices will show up here." />}
          ListFooterComponent={state.more ? <ActivityIndicator style={{ margin: 16 }} color={colors.blue} /> : null}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!state.more && state.page < state.pages) load('more');
          }}
          refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => load('refresh')} colors={[colors.blue]} tintColor={colors.blue} />}
        />
      )}
    </View>
  );
}
