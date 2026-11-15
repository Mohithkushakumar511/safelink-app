import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { api, formatApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';

export default function AdminUsersScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    if (!isAuthenticated || authLoading) return;
    setIsLoading(true);
    try {
      const data = await api.admin.getUsers();
      setUsers(data);
    } catch (e: any) {
      Alert.alert('Error', formatApiError(e));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || user?.role !== 'ADMIN') {
        router.replace('/dashboard');
      } else {
        fetchUsers();
      }
    }
  }, [authLoading, isAuthenticated, user?.role]);

  return (
    <ScreenWrapper style={styles.screen}>
      <Text style={styles.title}>Registered System Users</Text>
      <Text style={styles.sub}>Authenticated account roster stored in MongoDB</Text>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.warningAmber} />
        </View>
      ) : users.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={{ color: Colors.textMuted }}>No registered users found.</Text>
        </Card>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card style={styles.userCard}>
              <View style={styles.userRow}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>
                    {item.name ? item.name[0].toUpperCase() : 'U'}
                  </Text>
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.nameBadgeRow}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Badge
                      label={item.role}
                      variant={item.role === 'ADMIN' ? 'danger' : 'info'}
                      style={{ marginLeft: 6 }}
                    />
                  </View>
                  <Text style={styles.userEmail}>{item.email}</Text>
                  <Text style={styles.userPhone}>
                    {item.phone_number || 'No phone recorded'}
                  </Text>
                </View>

                <Badge
                  label={item.status}
                  variant={item.status === 'ACTIVE' ? 'success' : 'danger'}
                />
              </View>
            </Card>
          )}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  userCard: {
    marginBottom: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  userEmail: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  userPhone: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
});
