import { useState, useRef, useEffect, useMemo, createElement } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform as RNPlatform, ScrollView, Keyboard } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/providers/AuthProvider';

type Category = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  parent_id: string | null;
  order: number | null;
};

export default function AddEntryScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const amountInputRef = useRef<any>(null);
  const noteInputRef = useRef<any>(null);

  // 固定費の期間指定用
  const [isFixedExpense, setIsFixedExpense] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(new Date().getFullYear() + 1, new Date().getMonth(), 1));
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: async (entry: any) => {
      if (!session?.user?.id) {
        throw new Error('ログインが必要です');
      }
      const { error } = await supabase.from('entries').insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      setShowSuccessMessage(true);
      resetForm();
      // 3秒後に成功メッセージを非表示
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
    },
    onError: (error: Error) => {
      Alert.alert('保存に失敗しました', error.message);
    },
  });

  const resetForm = () => {
    setAmount('');
    setNote('');
    setType('expense');
    setCategoryId(null);
    setSelectedParentId(null);
    setSelectedDate(new Date());
    setIsFixedExpense(false);
    setStartDate(new Date());
    setEndDate(new Date(new Date().getFullYear() + 1, new Date().getMonth(), 1));
    Keyboard.dismiss();
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

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const save = async () => {
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('エラー', '有効な金額を入力してください');
      return;
    }
    if (!categoryId) {
      Alert.alert('エラー', 'カテゴリを選択してください');
      return;
    }

    // 固定費の場合、期間の検証
    if (isFixedExpense) {
      if (startDate > endDate) {
        Alert.alert('エラー', '開始日は終了日より前である必要があります');
        return;
      }
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
        setShowSuccessMessage(true);
        resetForm();
        setTimeout(() => {
          setShowSuccessMessage(false);
        }, 3000);
        Alert.alert('保存完了', `${dates.length}件のエントリーを作成しました`);
      } catch (error: any) {
        Alert.alert('保存に失敗しました', error.message);
      }
    } else {
      // 通常のエントリー作成
      const entry = {
        type,
        amount: Number(amount),
        happened_on: selectedDate.toISOString().split('T')[0],
        note: note.trim() || null,
        category_id: categoryId,
        user_id: session?.user?.id,
      };
      createMutation.mutate(entry);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={RNPlatform.OS === 'ios' ? 90 : 0}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none">
        {showSuccessMessage && (
          <View style={styles.successMessage}>
            <Text style={styles.successMessageText}>✓ 記録を追加しました</Text>
          </View>
        )}
        <View style={styles.form}>
          <Text style={styles.formTitle}>新しい記録を追加</Text>

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
            style={[styles.saveButton, createMutation.isPending && styles.buttonDisabled]}
            onPress={save}
            disabled={createMutation.isPending}>
            <Text style={styles.saveButtonText}>
              {createMutation.isPending ? '保存中...' : '追加'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  successMessage: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  successMessageText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
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
  parentCategoryChip: {
    backgroundColor: '#e8f4f8',
    borderColor: '#2f95dc',
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
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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
});
