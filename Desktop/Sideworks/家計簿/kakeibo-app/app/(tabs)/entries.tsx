import { useMemo, useState, useCallback, useRef } from 'react';
import { Alert, FlatList, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform as RNPlatform, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

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
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const amountInputRef = useRef<any>(null);
  const noteInputRef = useRef<any>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    enabled: !!session,
  });

  // 親カテゴリと子カテゴリを分離
  const parentCategories = useMemo(
    () => categories.filter((c) => c.type === type && c.parent_id === null),
    [categories, type]
  );

  const childCategories = useMemo(
    () => categories.filter((c) => c.type === type && c.parent_id !== null),
    [categories, type]
  );

  // 選択された親カテゴリの子カテゴリのみを表示
  const filteredCategories = useMemo(() => {
    if (type === 'expense' && selectedParentId) {
      return childCategories.filter((c) => c.parent_id === selectedParentId);
    }
    // 収入カテゴリまたは親カテゴリ未選択の場合は全て表示（後方互換性のため）
    return type === 'income' ? categories.filter((c) => c.type === type && c.parent_id === null) : [];
  }, [categories, type, selectedParentId, childCategories]);

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

  const createMutation = useMutation({
    mutationFn: async (entry: Omit<Entry, 'id' | 'created_at' | 'categories'>) => {
      const { error } = await supabase.from('entries').insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      resetForm();
    },
    onError: (error: Error) => {
      Alert.alert('保存に失敗しました', error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...entry }: Partial<Entry> & { id: string }) => {
      const { error } = await supabase.from('entries').update(entry).eq('id', id);
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
      const { error } = await supabase.from('entries').delete().eq('id', id);
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
    setIsFormExpanded(false);
  };

  const save = () => {
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('有効な金額を入力してください');
      return;
    }
    if (!categoryId) {
      Alert.alert('カテゴリを選択してください');
      return;
    }

    const entry = {
      type,
      amount: Number(amount),
      happened_on: selectedDate.toISOString().split('T')[0],
      note: note.trim() || null,
      category_id: categoryId,
      user_id: session?.user?.id,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...entry });
    } else {
      createMutation.mutate(entry);
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
    setIsFormExpanded(true);
  };

  const onDelete = (id: string) => {
    Alert.alert('削除確認', 'この記録を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          deleteMutation.mutate(id);
          if (editingId === id) resetForm();
        },
      },
    ]);
  };

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`;
  };

  const totalIncome = useMemo(
    () => entries.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0),
    [entries]
  );
  const totalExpense = useMemo(
    () => entries.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0),
    [entries]
  );

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

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'all' && styles.filterChipActive]}
            onPress={() => setFilterType('all')}>
            <Text style={filterType === 'all' ? styles.filterChipTextActive : styles.filterChipText}>すべて</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'income' && styles.filterChipActive]}
            onPress={() => setFilterType('income')}>
            <Text style={filterType === 'income' ? styles.filterChipTextActive : styles.filterChipText}>収入</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterType === 'expense' && styles.filterChipActive]}
            onPress={() => setFilterType('expense')}>
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
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={RNPlatform.OS === 'ios' ? 90 : 0}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.formContainer}>
          {!isFormExpanded && !editingId ? (
            <TouchableOpacity
              style={styles.expandFormButton}
              onPress={() => setIsFormExpanded(true)}>
              <Text style={styles.expandFormButtonText}>+ 新しい記録を追加</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.form}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>{editingId ? '記録を編集' : '新しい記録を追加'}</Text>
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
                  }}>
                  <Text style={type === 'expense' ? styles.chipTextActive : styles.chipText}>支出</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, type === 'income' && styles.chipActive]}
                  onPress={() => {
                    setType('income');
                    setCategoryId(null);
                  }}>
                  <Text style={type === 'income' ? styles.chipTextActive : styles.chipText}>収入</Text>
                </TouchableOpacity>
              </View>

              {Platform.OS === 'web' ? (
                <View style={styles.dateButton}>
                  <Text style={styles.dateButtonLabel}>日付:</Text>
                  <TextInput
                    {...({ type: 'date' } as any)}
                    value={selectedDate.toISOString().split('T')[0]}
                    onChangeText={(text) => {
                      if (text) {
                        setSelectedDate(new Date(text));
                      }
                    }}
                    style={styles.dateInputWeb}
                  />
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

              <TextInput
                ref={amountInputRef}
                style={styles.input}
                placeholder="金額"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => {
                  amountInputRef.current?.blur();
                  Keyboard.dismiss();
                }}
                blurOnSubmit={true}
              />

              {type === 'expense' && parentCategories.length > 0 && !selectedParentId && (
                <>
                  <Text style={styles.categoryLabel}>親カテゴリを選択</Text>
                  <FlatList
                    data={parentCategories}
                    keyExtractor={(item) => item.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryList}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.categoryChip, styles.parentCategoryChip]}
                        onPress={() => setSelectedParentId(item.id)}>
                        <Text style={styles.categoryChipText}>{item.name}</Text>
                      </TouchableOpacity>
                    )}
                  />
                </>
              )}

              {type === 'expense' && selectedParentId && (
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
                  <FlatList
                    data={filteredCategories}
                    keyExtractor={(item) => item.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryList}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.categoryChip, categoryId === item.id && styles.categoryChipActive]}
                        onPress={() => setCategoryId(item.id)}>
                        <Text style={categoryId === item.id ? styles.categoryChipTextActive : styles.categoryChipText}>
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyCategoryText}>カテゴリがありません</Text>}
                  />
                </>
              )}

              {type === 'income' && (
                <FlatList
                  data={filteredCategories}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.categoryChip, categoryId === item.id && styles.categoryChipActive]}
                      onPress={() => setCategoryId(item.id)}>
                      <Text style={categoryId === item.id ? styles.categoryChipTextActive : styles.categoryChipText}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={styles.emptyCategoryText}>カテゴリがありません</Text>}
                />
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
                style={[styles.saveButton, (createMutation.isPending || updateMutation.isPending) && styles.buttonDisabled]}
                onPress={save}
                disabled={createMutation.isPending || updateMutation.isPending}>
                <Text style={styles.saveButtonText}>
                  {createMutation.isPending || updateMutation.isPending
                    ? '保存中...'
                    : editingId
                      ? '更新'
                      : '追加'}
                </Text>
              </TouchableOpacity>
              {editingId && (
                <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
                  <Text style={styles.cancelText}>キャンセル</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>読み込み中...</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemDate}>{item.happened_on}</Text>
                <Text style={styles.itemCategory}>{item.categories?.name || '未分類'}</Text>
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
              <Text style={styles.emptyText}>記録がありません。追加してください。</Text>
            </View>
          }
          contentContainerStyle={entries.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  formContainer: {
    padding: 20,
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
  expandFormButton: {
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
  expandFormButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.3,
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
    padding: 20,
    paddingBottom: 40,
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
  categoryList: {
    paddingVertical: 4,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    marginRight: 10,
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
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  },
  empty: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
