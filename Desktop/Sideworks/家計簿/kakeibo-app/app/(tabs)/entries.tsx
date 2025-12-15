import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect, createElement } from 'react';
import { Alert, FlatList, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform as RNPlatform, ScrollView, Keyboard, TouchableWithoutFeedback, Modal, Dimensions } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { BarChart } from 'react-native-chart-kit';

import { Text, View } from '@/components/Themed';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/providers/AuthProvider';

type Entry = {
  id: string;
  category_id: string | null;
  type: 'income' | 'expense';
  amount: number;
  happened_on: string;
  note: string | null;
  created_at: string;
  categories?: { name: string } | null;
};

type Category = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  parent_id: string | null;
  order: number | null;
};

export default function EntriesScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterMonth, setFilterMonth] = useState(new Date());
  const amountInputRef = useRef<any>(null);
  const noteInputRef = useRef<any>(null);

  // グラフ表示用のstate
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [showGraphModal, setShowGraphModal] = useState(false);

  // 親カテゴリごとのタブ表示用のstate
  const [selectedParentTab, setSelectedParentTab] = useState<string | null>(null);

  // 固定費の期間指定用
  const [isFixedExpense, setIsFixedExpense] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(new Date().getFullYear() + 1, new Date().getMonth(), 1));
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    enabled: !!session,
  });

  // 親カテゴリと子カテゴリを分離し、order順にソート
  const parentCategories = useMemo(() => {
    const parents = categories.filter((c) => c.type === type && c.parent_id === null);
    // 親カテゴリの順序を定義（支出）
    const expenseParentOrder = ['固定費', '変動費', '投資'];
    // 親カテゴリの順序を定義（収入）
    const incomeParentOrder = ['給料', '貯金'];

    return parents.sort((a, b) => {
      if (type === 'expense') {
        const indexA = expenseParentOrder.indexOf(a.name);
        const indexB = expenseParentOrder.indexOf(b.name);
        if (indexA === -1 && indexB === -1) return (a.order ?? 0) - (b.order ?? 0);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      } else {
        const indexA = incomeParentOrder.indexOf(a.name);
        const indexB = incomeParentOrder.indexOf(b.name);
        if (indexA === -1 && indexB === -1) return (a.order ?? 0) - (b.order ?? 0);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      }
    });
  }, [categories, type]);

  // 支出の親カテゴリのみ（固定費、変動費、投資）
  const expenseParentCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense' && c.parent_id === null && ['固定費', '変動費', '投資'].includes(c.name)),
    [categories]
  );

  // 収入の親カテゴリのみ（給料、貯金）
  const incomeParentCategories = useMemo(
    () => categories.filter((c) => c.type === 'income' && c.parent_id === null && ['給料', '貯金'].includes(c.name)),
    [categories]
  );

  const childCategories = useMemo(
    () => categories.filter((c) => c.type === type && c.parent_id !== null),
    [categories, type]
  );

  // 固定費の親カテゴリIDを取得
  const fixedExpenseParentId = useMemo(() => {
    const fixedExpense = parentCategories.find(p => p.name === '固定費');
    return fixedExpense?.id || null;
  }, [parentCategories]);

  // 選択された親カテゴリの子カテゴリのみを表示し、order順にソート
  const filteredCategories = useMemo(() => {
    let filtered: Category[] = [];
    if (type === 'expense' && selectedParentId) {
      filtered = childCategories.filter((c) => c.parent_id === selectedParentId);
    } else if (type === 'income' && selectedParentId) {
      filtered = childCategories.filter((c) => c.parent_id === selectedParentId);
    }
    // order順にソート（orderが同じ場合は名前順）
    return filtered.sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [categories, type, selectedParentId, childCategories]);

  // 選択されたカテゴリが固定費かどうかを判定
  useEffect(() => {
    if (categoryId && selectedParentId === fixedExpenseParentId) {
      setIsFixedExpense(true);
    } else {
      setIsFixedExpense(false);
    }
  }, [categoryId, selectedParentId, fixedExpenseParentId]);

  const { data: entries = [], isLoading } = useQuery<Entry[]>({
    queryKey: ['entries', filterType, filterMonth],
    queryFn: async () => {
      let query = supabase
        .from('entries')
        .select('*, categories(name)')
        .order('happened_on', { ascending: false })
        .order('created_at', { ascending: false });

      if (filterType !== 'all') {
        query = query.eq('type', filterType);
      }

      const year = filterMonth.getFullYear();
      const month = filterMonth.getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
      query = query.gte('happened_on', startDate).lte('happened_on', endDate);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
    enabled: !!session,
  });

  // カテゴリごとの月毎の集計データを取得（全期間）
  const { data: categoryMonthlyData = [] } = useQuery<Array<{ month: string; total: number }>>({
    queryKey: ['categoryMonthlyData', selectedCategoryId],
    queryFn: async () => {
      if (!selectedCategoryId || !session) return [];

      // 全てのエントリーを取得
      const { data, error } = await supabase
        .from('entries')
        .select('amount, happened_on')
        .eq('category_id', selectedCategoryId)
        .eq('type', 'expense')
        .order('happened_on', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // 月ごとに集計
      const monthlyTotals = new Map<string, number>();

      data.forEach((entry) => {
        const date = new Date(entry.happened_on);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + entry.amount);
      });

      // 月順にソートして配列に変換
      const months = Array.from(monthlyTotals.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return months;
    },
    enabled: !!selectedCategoryId && !!session,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...entry }: Partial<Entry> & { id: string }) => {
      if (!session?.user?.id) {
        throw new Error('ログインが必要です');
      }
      const { error } = await supabase
        .from('entries')
        .update(entry)
        .eq('id', id)
        .eq('user_id', session.user.id)
        .is('household_id', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      resetForm();
    },
    onError: (error: Error) => {
      Alert.alert('更新に失敗しました', error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!session?.user?.id) {
        throw new Error('ログインが必要です');
      }
      const { error } = await supabase
        .from('entries')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id)
        .is('household_id', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error: Error) => {
      Alert.alert('削除に失敗しました', error.message);
    },
  });

  const resetForm = () => {
    setAmount('');
    setNote('');
    setType('expense');
    setCategoryId(null);
    setSelectedParentId(null);
    setSelectedDate(new Date());
    setEditingId(null);
    setIsFixedExpense(false);
    setStartDate(new Date());
    setEndDate(new Date(new Date().getFullYear() + 1, new Date().getMonth(), 1));
  };

  // 期間中の各月の1日を生成する関数
  const generateMonthlyDates = (start: Date, end: Date): string[] => {
    const dates: string[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endDate = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setMonth(current.getMonth() + 1);
    }

    return dates;
  };

  const save = async () => {
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('有効な金額を入力してください');
      return;
    }
    if (!categoryId) {
      Alert.alert('カテゴリを選択してください');
      return;
    }

    // 固定費の場合、期間の検証
    if (isFixedExpense) {
      if (startDate > endDate) {
        Alert.alert('開始日は終了日より前である必要があります');
        return;
      }
    }

    if (editingId) {
      // 編集の場合は通常の処理
      const entry = {
        type,
        amount: Number(amount),
        happened_on: selectedDate.toISOString().split('T')[0],
        note: note.trim() || null,
        category_id: categoryId,
        user_id: session?.user?.id,
      };
      updateMutation.mutate({ id: editingId, ...entry });
      return;
    }

    if (isFixedExpense) {
      // 固定費の場合、期間中の各月にエントリーを作成
      const dates = generateMonthlyDates(startDate, endDate);
      const entries = dates.map(date => ({
        type,
        amount: Number(amount),
        happened_on: date,
        note: note.trim() || `${formatDate(startDate)}〜${formatDate(endDate)}の固定費`,
        category_id: categoryId,
        user_id: session?.user?.id,
      }));

      try {
        const { error } = await supabase.from('entries').insert(entries);
        if (error) {
          Alert.alert('保存に失敗しました', error.message);
          return;
        }
        queryClient.invalidateQueries({ queryKey: ['entries'] });
        resetForm();
        Alert.alert('保存完了', `${dates.length}件のエントリーを作成しました`);
      } catch (error: any) {
        Alert.alert('保存に失敗しました', error.message);
      }
    }
  };

  const onEdit = (item: Entry) => {
    setEditingId(item.id);
    setAmount(String(item.amount));
    setNote(item.note || '');
    setType(item.type);
    setCategoryId(item.category_id);
    // 編集時に親カテゴリも設定
    if (item.category_id) {
      const category = categories.find(c => c.id === item.category_id);
      if (category?.parent_id) {
        setSelectedParentId(category.parent_id);
      } else {
        setSelectedParentId(null);
      }
    }
    setSelectedDate(new Date(item.happened_on));
  };

  const performDelete = useCallback((id: string) => {
    if (!session?.user?.id) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }
    deleteMutation.mutate(id);
    if (editingId === id) resetForm();
  }, [session, deleteMutation, editingId, resetForm]);

  const onDelete = (id: string) => {
    // Webプラットフォームではwindow.confirmを使用
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('この記録を削除しますか？');
      if (confirmed) {
        performDelete(id);
      }
    } else {
      // ネイティブプラットフォームではAlert.alertを使用
      Alert.alert('削除確認', 'この記録を削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            performDelete(id);
          },
        },
      ]);
    }
  };

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`;
  };

  // カテゴリをクリックしてグラフを表示
  const onCategoryPress = (categoryId: string | null, categoryName: string | null) => {
    if (!categoryId) return;
    setSelectedCategoryId(categoryId);
    setSelectedCategoryName(categoryName);
    setShowGraphModal(true);
  };

  const totalIncome = useMemo(
    () => entries.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0),
    [entries]
  );
  const totalExpense = useMemo(
    () => entries.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0),
    [entries]
  );

  // 親カテゴリごとの集計データ（支出）
  const expenseParentCategorySummary = useMemo(() => {
    const summary: Record<string, { name: string; total: number; children: Record<string, number> }> = {};

    expenseParentCategories.forEach(parent => {
      summary[parent.id] = {
        name: parent.name,
        total: 0,
        children: {},
      };
    });

    entries
      .filter(e => e.type === 'expense' && e.category_id)
      .forEach(entry => {
        const category = categories.find(c => c.id === entry.category_id);
        if (category?.parent_id && summary[category.parent_id]) {
          summary[category.parent_id].total += entry.amount;
          const childName = category.name;
          summary[category.parent_id].children[childName] =
            (summary[category.parent_id].children[childName] || 0) + entry.amount;
        }
      });

    return summary;
  }, [entries, categories, expenseParentCategories]);

  // 親カテゴリごとの集計データ（収入）
  const incomeParentCategorySummary = useMemo(() => {
    const summary: Record<string, { name: string; total: number; children: Record<string, number> }> = {};

    incomeParentCategories.forEach(parent => {
      summary[parent.id] = {
        name: parent.name,
        total: 0,
        children: {},
      };
    });

    entries
      .filter(e => e.type === 'income' && e.category_id)
      .forEach(entry => {
        const category = categories.find(c => c.id === entry.category_id);
        if (category?.parent_id && summary[category.parent_id]) {
          summary[category.parent_id].total += entry.amount;
          const childName = category.name;
          summary[category.parent_id].children[childName] =
            (summary[category.parent_id].children[childName] || 0) + entry.amount;
        }
      });

    return summary;
  }, [entries, categories, incomeParentCategories]);

  // 現在のフィルタータイプに応じた親カテゴリと集計データ
  const currentParentCategories = filterType === 'expense' ? expenseParentCategories : filterType === 'income' ? incomeParentCategories : [];
  const currentParentCategorySummary = filterType === 'expense' ? expenseParentCategorySummary : filterType === 'income' ? incomeParentCategorySummary : {};

  // フィルタータイプが変更された時に、選択された親カテゴリタブをリセット
  const prevFilterTypeRef = useRef(filterType);
  useEffect(() => {
    if (prevFilterTypeRef.current !== filterType) {
      console.log('FilterType changed, resetting selectedParentTab');
      setSelectedParentTab(null);
      prevFilterTypeRef.current = filterType;
    }
  }, [filterType]);

  // selectedParentTabの変更を監視
  useEffect(() => {
    console.log('selectedParentTab changed to:', selectedParentTab);
  }, [selectedParentTab]);

  // 親カテゴリタブに基づいてエントリーをフィルタリング
  const filteredEntries = useMemo(() => {
    if (!selectedParentTab) {
      return entries;
    }

    // 選択された親カテゴリの子カテゴリIDを取得
    const childCategoryIds = categories
      .filter(c => c.parent_id === selectedParentTab)
      .map(c => c.id);

    // 子カテゴリに属するエントリーのみを返す
    return entries.filter(entry =>
      entry.category_id && childCategoryIds.includes(entry.category_id)
    );
  }, [entries, selectedParentTab, categories]);

  const renderHeader = useCallback(() => (
    <>
      <Text style={styles.title}>収支記録</Text>

      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>収入</Text>
          <Text style={[styles.summaryAmount, styles.incomeAmount]}>{formatCurrency(totalIncome)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>支出</Text>
          <Text style={[styles.summaryAmount, styles.expenseAmount]}>{formatCurrency(totalExpense)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>差額</Text>
          <Text style={[styles.summaryAmount, totalIncome - totalExpense >= 0 ? styles.incomeAmount : styles.expenseAmount]}>
            {formatCurrency(totalIncome - totalExpense)}
          </Text>
        </View>
      </View>

      {/* 親カテゴリごとのタブ（支出または収入が選択されている時のみ表示） */}
      {currentParentCategories.length > 0 && (filterType === 'expense' || filterType === 'income') && (
        <View style={styles.parentTabs}>
          <TouchableOpacity
            style={selectedParentTab === null ? [styles.parentTab, styles.parentTabActive] : styles.parentTab}
            onPress={() => {
              console.log('Pressing All tab');
              setSelectedParentTab(null);
            }}>
            <Text style={selectedParentTab === null ? [styles.parentTabText, styles.parentTabTextActive] : styles.parentTabText}>
              すべて
            </Text>
          </TouchableOpacity>
          {currentParentCategories.map((parent) => {
            const isActive = selectedParentTab === parent.id;
            const summary = currentParentCategorySummary[parent.id];
            return (
              <TouchableOpacity
                key={parent.id}
                style={isActive ? [styles.parentTab, styles.parentTabActive] : styles.parentTab}
                onPress={() => {
                  console.log('Pressing tab:', parent.name, 'ID:', parent.id);
                  console.log('Current selectedParentTab:', selectedParentTab);
                  setSelectedParentTab(parent.id);
                  console.log('Set selectedParentTab to:', parent.id);
                }}>
                <Text style={isActive ? [styles.parentTabText, styles.parentTabTextActive] : styles.parentTabText}>
                  {parent.name}
                </Text>
                {summary && (
                  <Text style={isActive ? styles.parentTabAmount : styles.parentTabAmountInactive}>
                    {formatCurrency(summary.total)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 親カテゴリごとの集計表示 */}
      {selectedParentTab && currentParentCategorySummary[selectedParentTab] && (
        <View style={styles.parentSummary}>
          <Text style={styles.parentSummaryTitle}>
            {currentParentCategorySummary[selectedParentTab].name}の合計: {formatCurrency(currentParentCategorySummary[selectedParentTab].total)}
          </Text>
          <View style={styles.childrenSummary}>
            {Object.entries(currentParentCategorySummary[selectedParentTab].children)
              .sort(([, a], [, b]) => b - a)
              .map(([childName, amount]) => (
                <View key={childName} style={styles.childSummaryRow}>
                  <Text style={styles.childSummaryName}>{childName}</Text>
                  <Text style={styles.childSummaryAmount}>{formatCurrency(amount)}</Text>
                </View>
              ))}
          </View>
        </View>
      )}

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'all' && styles.filterChipActive]}
            onPress={() => {
              setFilterType('all');
              setSelectedParentTab(null);
            }}>
            <Text style={filterType === 'all' ? styles.filterChipTextActive : styles.filterChipText}>すべて</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'income' && styles.filterChipActive]}
            onPress={() => {
              setFilterType('income');
              setSelectedParentTab(null);
            }}>
            <Text style={filterType === 'income' ? styles.filterChipTextActive : styles.filterChipText}>収入</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'expense' && styles.filterChipActive]}
            onPress={() => {
              setFilterType('expense');
              setSelectedParentTab(null);
            }}>
            <Text style={filterType === 'expense' ? styles.filterChipTextActive : styles.filterChipText}>支出</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.monthLabel}>
          {filterMonth.getFullYear()}年{filterMonth.getMonth() + 1}月
        </Text>
      </View>

      <Text style={styles.listTitle}>記録一覧</Text>
    </>
  ), [
    totalIncome,
    totalExpense,
    filterType,
    filterMonth,
    selectedParentTab,
    currentParentCategories,
    currentParentCategorySummary,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={RNPlatform.OS === 'ios' ? 90 : 0}>
      {editingId && (
        <View style={styles.formContainer}>
          <ScrollView
            style={styles.formScrollView}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none">
            <View style={styles.form}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>記録を編集</Text>
                <TouchableOpacity
                  onPress={() => {
                    resetForm();
                    Keyboard.dismiss();
                  }}>
                  <Text style={styles.collapseButtonText}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.chip, type === 'expense' && styles.chipActive]}
                  onPress={() => {
                    setType('expense');
                    setCategoryId(null);
                    setSelectedParentId(null);
                    setIsFixedExpense(false);
                  }}>
                  <Text style={type === 'expense' ? styles.chipTextActive : styles.chipText}>支出</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, type === 'income' && styles.chipActive]}
                  onPress={() => {
                    setType('income');
                    setCategoryId(null);
                    setSelectedParentId(null);
                    setIsFixedExpense(false);
                  }}>
                  <Text style={type === 'income' ? styles.chipTextActive : styles.chipText}>収入</Text>
                </TouchableOpacity>
              </View>

              {isFixedExpense ? (
                <>
                  <Text style={styles.fixedExpenseLabel}>固定費の期間を指定</Text>
                  {Platform.OS === 'web' ? (
                    <>
                      <View style={styles.dateButton}>
                        <Text style={styles.dateButtonLabel}>開始日:</Text>
                        {createElement('input', {
                          type: 'date',
                          value: startDate.toISOString().split('T')[0],
                          onChange: (e: any) => {
                            if (e.target && e.target.value) {
                              setStartDate(new Date(e.target.value));
                            }
                          },
                          style: {
                            flex: 1,
                            fontSize: 15,
                            color: '#374151',
                            fontWeight: '500',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                          },
                        } as any)}
                      </View>
                      <View style={styles.dateButton}>
                        <Text style={styles.dateButtonLabel}>終了日:</Text>
                        {createElement('input', {
                          type: 'date',
                          value: endDate.toISOString().split('T')[0],
                          onChange: (e: any) => {
                            if (e.target && e.target.value) {
                              setEndDate(new Date(e.target.value));
                            }
                          },
                          style: {
                            flex: 1,
                            fontSize: 15,
                            color: '#374151',
                            fontWeight: '500',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                          },
                        } as any)}
                      </View>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.dateButton} onPress={() => setShowStartDatePicker(true)}>
                        <Text style={styles.dateButtonText}>開始日: {formatDate(startDate)}</Text>
                      </TouchableOpacity>
                      {showStartDatePicker && (
                        <>
                          <DateTimePicker
                            value={startDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                              if (Platform.OS === 'android') {
                                setShowStartDatePicker(false);
                              }
                              if (date) setStartDate(date);
                            }}
                          />
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity
                              style={styles.datePickerDoneButton}
                              onPress={() => setShowStartDatePicker(false)}>
                              <Text style={styles.datePickerDoneText}>完了</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                      <TouchableOpacity style={styles.dateButton} onPress={() => setShowEndDatePicker(true)}>
                        <Text style={styles.dateButtonText}>終了日: {formatDate(endDate)}</Text>
                      </TouchableOpacity>
                      {showEndDatePicker && (
                        <>
                          <DateTimePicker
                            value={endDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                              if (Platform.OS === 'android') {
                                setShowEndDatePicker(false);
                              }
                              if (date) setEndDate(date);
                            }}
                          />
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity
                              style={styles.datePickerDoneButton}
                              onPress={() => setShowEndDatePicker(false)}>
                              <Text style={styles.datePickerDoneText}>完了</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </>
                  )}
                  <Text style={styles.fixedExpenseInfo}>
                    期間中の各月に自動的にエントリーが作成されます
                  </Text>
                </>
              ) : (
                <>
                  {Platform.OS === 'web' ? (
                    <View style={styles.dateButton}>
                      <Text style={styles.dateButtonLabel}>日付:</Text>
                      {createElement('input', {
                        type: 'date',
                        value: selectedDate.toISOString().split('T')[0],
                        onChange: (e: any) => {
                          if (e.target && e.target.value) {
                            setSelectedDate(new Date(e.target.value));
                          }
                        },
                        style: {
                          flex: 1,
                          fontSize: 15,
                          color: '#374151',
                          fontWeight: '500',
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                        },
                      } as any)}
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                        <Text style={styles.dateButtonText}>日付: {formatDate(selectedDate)}</Text>
                      </TouchableOpacity>
                      {showDatePicker && (
                        <>
                          <DateTimePicker
                            value={selectedDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, date) => {
                              if (Platform.OS === 'android') {
                                setShowDatePicker(false);
                              }
                              if (date) setSelectedDate(date);
                            }}
                          />
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity
                              style={styles.datePickerDoneButton}
                              onPress={() => setShowDatePicker(false)}>
                              <Text style={styles.datePickerDoneText}>完了</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              <TextInput
                ref={amountInputRef}
                style={styles.input}
                placeholder="金額"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                returnKeyType="done"
                editable={true}
                autoFocus={false}
                onSubmitEditing={() => {
                  amountInputRef.current?.blur();
                  Keyboard.dismiss();
                }}
                blurOnSubmit={true}
              />

              {(type === 'expense' || type === 'income') && parentCategories.length > 0 && !selectedParentId && (
                <>
                  <Text style={styles.categoryLabel}>親カテゴリを選択</Text>
                  <View style={styles.categoryContainer}>
                    {parentCategories.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.categoryChip, styles.parentCategoryChip]}
                        onPress={() => setSelectedParentId(item.id)}>
                        <Text style={styles.categoryChipText}>{item.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {(type === 'expense' || type === 'income') && selectedParentId && (
                <>
                  <View style={styles.categoryHeader}>
                    <TouchableOpacity onPress={() => {
                      setSelectedParentId(null);
                      setCategoryId(null);
                    }}>
                      <Text style={styles.backButton}>← 戻る</Text>
                    </TouchableOpacity>
                    <Text style={styles.categoryLabel}>
                      {parentCategories.find(p => p.id === selectedParentId)?.name}のカテゴリ
                    </Text>
                  </View>
                  <View style={styles.categoryContainer}>
                    {filteredCategories.length > 0 ? (
                      filteredCategories.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.categoryChip, categoryId === item.id && styles.categoryChipActive]}
                          onPress={() => setCategoryId(item.id)}>
                          <Text style={categoryId === item.id ? styles.categoryChipTextActive : styles.categoryChipText}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <Text style={styles.emptyCategoryText}>カテゴリがありません</Text>
                    )}
                  </View>
                </>
              )}

              <TextInput
                ref={noteInputRef}
                style={[styles.input, styles.noteInput]}
                placeholder="メモ（任意）"
                value={note}
                onChangeText={setNote}
                multiline
                returnKeyType="done"
                onSubmitEditing={() => {
                  noteInputRef.current?.blur();
                  Keyboard.dismiss();
                }}
                blurOnSubmit={true}
              />

              <TouchableOpacity
                style={[styles.saveButton, updateMutation.isPending && styles.buttonDisabled]}
                onPress={save}
                disabled={updateMutation.isPending}>
                <Text style={styles.saveButtonText}>
                  {updateMutation.isPending ? '更新中...' : '更新'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}

      {isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>読み込み中...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemDate}>{item.happened_on}</Text>
                <TouchableOpacity onPress={() => onCategoryPress(item.category_id, item.categories?.name || null)}>
                  <Text style={[styles.itemCategory, styles.categoryLink]}>{item.categories?.name || '未分類'}</Text>
                </TouchableOpacity>
                {item.note && <Text style={styles.itemNote}>{item.note}</Text>}
              </View>
              <View style={styles.itemRight}>
                <Text style={[styles.itemAmount, item.type === 'income' ? styles.incomeAmount : styles.expenseAmount]}>
                  {item.type === 'income' ? '+' : '-'}
                  {formatCurrency(item.amount)}
                </Text>
                <View style={styles.itemActions}>
                  <TouchableOpacity onPress={() => onEdit(item)} style={styles.itemButton}>
                    <Text style={styles.editText}>編集</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDelete(item.id)} style={[styles.itemButton, styles.deleteButton]}>
                    <Text style={styles.deleteText}>削除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>記録がありません</Text>
              <Text style={styles.emptyText}>「追加」タブから新しい記録を追加できます</Text>
            </View>
          }
          contentContainerStyle={filteredEntries.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      )}

      {/* グラフモーダル */}
      <Modal
        visible={showGraphModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGraphModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedCategoryName || 'カテゴリ'}の月毎の支出
              </Text>
              <TouchableOpacity onPress={() => setShowGraphModal(false)}>
                <Text style={styles.modalCloseButton}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {categoryMonthlyData.length > 0 ? (
                <View style={styles.chartWrapper}>
                  <ScrollView
                    horizontal={true}
                    showsHorizontalScrollIndicator={true}
                    style={styles.chartScrollView}
                    contentContainerStyle={styles.chartScrollContent}
                  >
                    <View style={styles.chartContainer}>
                      <BarChart
                        data={{
                          labels: categoryMonthlyData.map(d => {
                            const [year, month] = d.month.split('-');
                            return `${month}/${year.slice(2)}`;
                          }),
                          datasets: [
                            {
                              data: categoryMonthlyData.map(d => d.total),
                            },
                          ],
                        }}
                        width={Math.max(
                          Dimensions.get('window').width - 80,
                          categoryMonthlyData.length * 60
                        )}
                        height={350}
                        yAxisLabel="¥"
                        yAxisSuffix=""
                        fromZero={true}
                        yAxisInterval={1}
                        formatYLabel={(value) => {
                          const num = parseFloat(value);
                          if (num >= 10000) {
                            return `${(num / 10000).toFixed(1)}万`;
                          }
                          return Math.round(num).toString();
                        }}
                        chartConfig={{
                          backgroundColor: '#ffffff',
                          backgroundGradientFrom: '#ffffff',
                          backgroundGradientTo: '#ffffff',
                          decimalPlaces: 0,
                          color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
                          labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                          style: {
                            borderRadius: 16,
                          },
                          barPercentage: 0.7,
                          propsForLabels: {
                            fontSize: categoryMonthlyData.length > 12 ? 9 : 10,
                          },
                        }}
                        style={{
                          marginVertical: 8,
                          borderRadius: 16,
                        }}
                        showValuesOnTopOfBars={true}
                        verticalLabelRotation={categoryMonthlyData.length > 12 ? -45 : 0}
                      />
                    </View>
                  </ScrollView>
                  <View style={styles.chartSummary}>
                    {categoryMonthlyData.map((d, index) => (
                      <View key={index} style={styles.summaryRow}>
                        <Text style={styles.summaryMonth}>
                          {d.month.replace('-', '年').replace('-', '月')}月
                        </Text>
                        <Text style={styles.summaryAmount}>
                          {formatCurrency(d.total)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyChartText}>
                    このカテゴリのデータがありません
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  formContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  collapseButtonText: {
    fontSize: 28,
    color: '#6b7280',
    fontWeight: '300',
    lineHeight: 28,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    gap: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  summaryAmount: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  incomeAmount: {
    color: '#10b981',
  },
  expenseAmount: {
    color: '#ef4444',
  },
  filters: {
    gap: 12,
    marginBottom: 20,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  filterChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  filterChipText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
  },
  parentTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  parentTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  parentTabActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  parentTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  parentTabTextActive: {
    color: '#ffffff',
  },
  parentTabAmount: {
    fontSize: 11,
    color: '#ffffff',
    marginTop: 4,
    fontWeight: '500',
  },
  parentTabAmountInactive: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    fontWeight: '500',
  },
  parentSummary: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  parentSummaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  childrenSummary: {
    gap: 8,
  },
  childSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  childSummaryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  childSummaryAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22c55e',
  },
  formScrollView: {
    flex: 1,
  },
  formScrollContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  form: {
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  chipText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  dateButton: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    gap: 8,
  },
  dateButtonLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  dateButtonText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  fixedExpenseLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  fixedExpenseInfo: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
  },
  dateInputWeb: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  datePickerDoneButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  datePickerDoneText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  categoryChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryChipText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  backButton: {
    color: '#2f95dc',
    fontWeight: '600',
    fontSize: 14,
  },
  parentCategoryChip: {
    backgroundColor: '#e8f4f8',
    borderColor: '#2f95dc',
  },
  emptyCategoryText: {
    color: '#9ca3af',
    fontSize: 13,
    paddingVertical: 12,
    fontStyle: 'italic',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  cancelButton: {
    alignItems: 'center',
    padding: 12,
    marginTop: 4,
  },
  cancelText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 16,
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  itemLeft: {
    flex: 1,
    gap: 6,
    paddingRight: 12,
  },
  itemDate: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  itemCategory: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    letterSpacing: -0.2,
  },
  categoryLink: {
    color: '#2f95dc',
    textDecorationLine: 'underline',
  },
  itemNote: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 10,
  },
  itemAmount: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  itemButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  deleteText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 13,
  },
  editText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '90%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalCloseButton: {
    fontSize: 32,
    color: '#9ca3af',
    fontWeight: '300',
    lineHeight: 32,
  },
  modalBody: {
    flex: 1,
  },
  chartWrapper: {
    width: '100%',
  },
  chartScrollView: {
    width: '100%',
  },
  chartScrollContent: {
    paddingHorizontal: 10,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chartSummary: {
    marginTop: 20,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
  },
  summaryMonth: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  summaryAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#22c55e',
  },
  emptyChart: {
    padding: 40,
    alignItems: 'center',
  },
  emptyChartText: {
    fontSize: 16,
    color: '#9ca3af',
  },
});
