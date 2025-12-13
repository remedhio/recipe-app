import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Text, View } from '@/components/Themed';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/providers/AuthProvider';

type Category = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string | null;
  parent_id: string | null;
  order: number | null;
  created_at: string;
};

export default function CategoriesScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [parentId, setParentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 親カテゴリと子カテゴリを分離
  const parentCategories = useMemo(
    () => categories.filter(c => c.parent_id === null),
    [categories]
  );

  // 現在選択されているタイプに応じた親カテゴリを取得
  const currentParentCategories = useMemo(
    () => parentCategories.filter(c => c.type === type),
    [parentCategories, type]
  );

  const childCategories = useMemo(
    () => categories.filter(c => c.parent_id !== null),
    [categories]
  );

  const incomeCategories = useMemo(
    () => categories.filter(c => c.type === 'income'),
    [categories]
  );

  // 階層構造でソート（親カテゴリ → その子カテゴリ）
  const sorted = useMemo(() => {
    const result: Category[] = [];
    const addedIds = new Set<string>();

    // 親カテゴリの順序を定義（支出）
    const expenseParentOrder = ['固定費', '変動費', '投資'];
    // 親カテゴリの順序を定義（収入）
    const incomeParentOrder = ['給料', '貯金'];

    // 支出: 親カテゴリを定義された順序で処理
    const expenseParents = parentCategories.filter(p => p.type === 'expense');
    const sortedExpenseParents = expenseParents.sort((a, b) => {
      const indexA = expenseParentOrder.indexOf(a.name);
      const indexB = expenseParentOrder.indexOf(b.name);
      // 定義された順序にない場合は最後に配置
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    sortedExpenseParents.forEach(parent => {
      if (!addedIds.has(parent.id)) {
        result.push(parent);
        addedIds.add(parent.id);
      }
      // この親カテゴリの子カテゴリを取得してorder順にソート（orderが同じ場合は名前順）
      const children = childCategories
        .filter(c => c.parent_id === parent.id)
        .sort((a, b) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          return a.name.localeCompare(b.name);
        });
      children.forEach(child => {
        if (!addedIds.has(child.id)) {
          result.push(child);
          addedIds.add(child.id);
        }
      });
    });

    // 収入: 親カテゴリを定義された順序で処理
    const incomeParents = parentCategories.filter(p => p.type === 'income');
    const sortedIncomeParents = incomeParents.sort((a, b) => {
      const indexA = incomeParentOrder.indexOf(a.name);
      const indexB = incomeParentOrder.indexOf(b.name);
      // 定義された順序にない場合は最後に配置
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    sortedIncomeParents.forEach(parent => {
      if (!addedIds.has(parent.id)) {
        result.push(parent);
        addedIds.add(parent.id);
      }
      // この親カテゴリの子カテゴリを取得してorder順にソート（orderが同じ場合は名前順）
      const children = childCategories
        .filter(c => c.parent_id === parent.id)
        .sort((a, b) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          return a.name.localeCompare(b.name);
        });
      children.forEach(child => {
        if (!addedIds.has(child.id)) {
          result.push(child);
          addedIds.add(child.id);
        }
      });
    });

    return result;
  }, [parentCategories, childCategories]);

  useEffect(() => {
    if (session) {
      refresh();
      // 支出の親カテゴリ（固定費、変動費、投資）が存在しない場合は作成
      ensureExpenseParentCategories();
      // 収入の親カテゴリ（給料、貯金）が存在しない場合は作成
      ensureIncomeParentCategories();
    }
  }, [session]);

  // 支出の親カテゴリ（固定費、変動費、投資）を確保
  const ensureExpenseParentCategories = async () => {
    if (!session?.user?.id) return;

    const parentCategoryNames = ['固定費', '変動費', '投資'];
    const { data: existingParents } = await supabase
      .from('categories')
      .select('name')
      .eq('user_id', session.user.id)
      .eq('type', 'expense')
      .is('parent_id', null);

    const existingNames = (existingParents || []).map(c => c.name);
    const missingNames = parentCategoryNames.filter(name => !existingNames.includes(name));

    if (missingNames.length > 0) {
      const newCategories = missingNames.map(name => ({
        name,
        type: 'expense' as const,
        user_id: session.user.id,
        parent_id: null,
      }));

      await supabase.from('categories').insert(newCategories);
      refresh();
    }
  };

  // 収入の親カテゴリ（給料、貯金）を確保
  const ensureIncomeParentCategories = async () => {
    if (!session?.user?.id) return;

    const parentCategoryNames = ['給料', '貯金'];
    const { data: existingParents } = await supabase
      .from('categories')
      .select('name')
      .eq('user_id', session.user.id)
      .eq('type', 'income')
      .is('parent_id', null);

    const existingNames = (existingParents || []).map(c => c.name);
    const missingNames = parentCategoryNames.filter(name => !existingNames.includes(name));

    if (missingNames.length > 0) {
      const newCategories = missingNames.map(name => ({
        name,
        type: 'income' as const,
        user_id: session.user.id,
        parent_id: null,
      }));

      await supabase.from('categories').insert(newCategories);
      refresh();
    }
  };

  const refresh = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', session.user.id)
      .is('household_id', null);
    setLoading(false);
    if (error) {
      Alert.alert('取得に失敗しました', error.message);
      return;
    }
    setCategories((data ?? []) as Category[]);
  }, [session]);

  const resetForm = useCallback(() => {
    setName('');
    setType('expense');
    setParentId(null);
    setEditingId(null);
  }, []);

  const save = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('名前を入力してください');
      return;
    }

    // 支出カテゴリで親カテゴリが選択されていない場合はエラー
    if (type === 'expense' && !parentId) {
      Alert.alert('親カテゴリを選択してください', '支出カテゴリは「固定費」「変動費」「投資」のいずれかを選択してください');
      return;
    }

    // 収入カテゴリで親カテゴリが選択されていない場合はエラー
    if (type === 'income' && !parentId) {
      Alert.alert('親カテゴリを選択してください', '収入カテゴリは「給料」「貯金」のいずれかを選択してください');
      return;
    }

    if (!session?.user?.id) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }

    console.log('Saving category:', { name, type, parentId, editingId });
    const selectedParent = categories.find(c => c.id === parentId);
    console.log('Selected parent category:', selectedParent);

    setSaving(true);
    if (editingId) {
      const { error } = await supabase
        .from('categories')
        .update({ name, type, parent_id: parentId })
        .eq('id', editingId)
        .eq('user_id', session.user.id)
        .is('household_id', null);
      setSaving(false);
      if (error) {
        Alert.alert('更新に失敗しました', error.message);
        return;
      }
    } else {
      // 同じ親カテゴリの子カテゴリの最大orderを取得
      const siblings = categories.filter(c => c.parent_id === parentId);
      const maxOrder = siblings.length > 0
        ? Math.max(...siblings.map(s => s.order ?? 0))
        : -1;
      const newOrder = maxOrder + 1;

      const insertData = {
        name,
        type,
        parent_id: parentId,
        order: newOrder,
        user_id: session.user.id
      };
      console.log('Inserting category with data:', insertData);
      const { data, error } = await supabase.from('categories').insert(insertData).select();
      console.log('Insert result - data:', data, 'error:', error);
      setSaving(false);
      if (error) {
        Alert.alert('作成に失敗しました', error.message);
        return;
      }
    }
    resetForm();
    refresh();
    // React Queryのキャッシュを無効化して、他の画面でもカテゴリが更新されるようにする
    queryClient.invalidateQueries({ queryKey: ['categories'] });
  }, [name, type, parentId, editingId, session, resetForm, refresh, queryClient, categories]);

  // 親カテゴリ（固定費、変動費、投資、給料、貯金）かどうかを判定
  const isParentCategory = useCallback((item: Category) => {
    if (item.parent_id !== null) return false;
    if (item.type === 'expense' && ['固定費', '変動費', '投資'].includes(item.name)) return true;
    if (item.type === 'income' && ['給料', '貯金'].includes(item.name)) return true;
    return false;
  }, []);

  const onEdit = useCallback((item: Category) => {
    // 親カテゴリは編集不可
    if (isParentCategory(item)) {
      Alert.alert('編集不可', '親カテゴリ（固定費、変動費、投資）は編集できません');
      return;
    }
    setEditingId(item.id);
    setName(item.name);
    setType(item.type);
    setParentId(item.parent_id);
  }, [isParentCategory]);

  const performDelete = useCallback(async (id: string) => {
    console.log('performDelete called with id:', id);
    if (!session?.user?.id) {
      console.log('No session found');
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }
    console.log('Deleting category with id:', id, 'user_id:', session.user.id);
    try {
      const { data, error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id)
        .is('household_id', null)
        .select();
      console.log('Delete result - data:', data, 'error:', error);
      if (error) {
        console.error('Delete error:', error);
        Alert.alert('削除に失敗しました', error.message);
        return;
      }
      console.log('Delete successful, refreshing...');
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      if (editingId === id) resetForm();
      console.log('Delete process completed');
    } catch (err) {
      console.error('Delete exception:', err);
      Alert.alert('削除に失敗しました', err instanceof Error ? err.message : '不明なエラーが発生しました');
    }
  }, [session, refresh, queryClient, editingId, resetForm]);

  const onDelete = useCallback((id: string) => {
    console.log('onDelete called with id:', id);
    const item = categories.find(c => c.id === id);
    if (!item) {
      console.log('Item not found for id:', id);
      return;
    }

    console.log('Item found:', item);
    console.log('isParentCategory:', isParentCategory(item));

    // 親カテゴリは削除不可
    if (isParentCategory(item)) {
      const categoryType = item.type === 'expense' ? '支出' : '収入';
      Alert.alert('削除不可', `親カテゴリ（${categoryType}）は削除できません`);
      return;
    }

    console.log('Showing delete confirmation dialog');

    // Webプラットフォームではwindow.confirmを使用
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('このカテゴリを削除しますか？');
      if (confirmed) {
        console.log('Delete confirmed in window.confirm, calling performDelete...');
        performDelete(id);
      } else {
        console.log('Delete cancelled in window.confirm');
      }
    } else {
      // ネイティブプラットフォームではAlert.alertを使用
      Alert.alert('削除確認', 'このカテゴリを削除しますか？', [
        { text: 'キャンセル', style: 'cancel', onPress: () => console.log('Delete cancelled') },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            console.log('Delete button pressed in Alert, calling performDelete...');
            performDelete(id);
          },
        },
      ]);
    }
  }, [categories, isParentCategory, performDelete]);

  const moveCategory = useCallback(async (id: string, direction: 'up' | 'down') => {
    console.log('moveCategory called:', { id, direction });
    if (!session?.user?.id) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }

    const item = categories.find(c => c.id === id);
    if (!item) {
      console.log('Item not found:', id);
      return;
    }

    console.log('Item found:', item);

    // 親カテゴリは並び替え不可
    if (isParentCategory(item)) {
      Alert.alert('並び替え不可', '親カテゴリは並び替えできません');
      return;
    }

    // 同じ親カテゴリの子カテゴリを取得（自分を含む）
    let allSiblings = categories.filter(c => c.parent_id === item.parent_id);

    // orderがnull/undefined、またはすべて同じ値の場合、初期化が必要
    const orders = allSiblings.map(c => c.order).filter(o => o !== null && o !== undefined);
    const hasNullOrder = allSiblings.some(c => c.order === null || c.order === undefined);
    const allSameOrder = orders.length > 0 && new Set(orders).size === 1;

    if (hasNullOrder || allSameOrder) {
      console.log('Initializing order for categories...', { hasNullOrder, allSameOrder, orders });
      // 名前順でソートしてから、0から始まる連番をorderとして設定
      const sortedSiblings = [...allSiblings].sort((a, b) => a.name.localeCompare(b.name));

      // すべてのカテゴリにorderを設定
      try {
        for (let index = 0; index < sortedSiblings.length; index++) {
          const sibling = sortedSiblings[index];
          const newOrder = index;
          const { error } = await supabase
            .from('categories')
            .update({ order: newOrder })
            .eq('id', sibling.id)
            .eq('user_id', session.user.id)
            .is('household_id', null);
          if (error) {
            console.error('Error initializing order for', sibling.name, error);
            throw error;
          }
        }
        console.log('Order initialization completed');
        // 更新後に再取得
        await refresh();
        // 再取得したカテゴリを使用
        const { data: updatedCategories } = await supabase
          .from('categories')
          .select('*')
          .eq('user_id', session.user.id)
          .is('household_id', null);

        if (updatedCategories) {
          const updatedData = updatedCategories as Category[];
          setCategories(updatedData);
          // 更新されたカテゴリから再度取得
          const updatedItem = updatedData.find(c => c.id === id);
          if (updatedItem) {
            allSiblings = updatedData.filter(c => c.parent_id === updatedItem.parent_id);
          } else {
            console.error('Updated item not found');
            return;
          }
        }
      } catch (error) {
        console.error('Error initializing orders:', error);
        Alert.alert('エラー', '順序の初期化に失敗しました');
        return;
      }
    }

    // orderでソート
    allSiblings = allSiblings.sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    console.log('All siblings:', allSiblings.map(s => ({ name: s.name, order: s.order })));

    const currentIndex = allSiblings.findIndex(s => s.id === id);
    console.log('Current index:', currentIndex);

    if (direction === 'up') {
      if (currentIndex <= 0) {
        Alert.alert('これ以上上に移動できません');
        return;
      }
      const targetItem = allSiblings[currentIndex - 1];
      const targetOrder = targetItem.order ?? 0;
      const currentOrder = item.order ?? 0;

      console.log('Moving up - swapping with:', {
        targetItem: targetItem.name,
        targetOrder,
        currentOrder,
        targetItemOrder: targetItem.order,
        currentItemOrder: item.order
      });

      // 2つのカテゴリのorderを入れ替え
      try {
        const { error: error1 } = await supabase
          .from('categories')
          .update({ order: targetOrder })
          .eq('id', id)
          .eq('user_id', session.user.id)
          .is('household_id', null);

        if (error1) {
          console.error('Error updating current item:', error1);
          throw error1;
        }

        const { error: error2 } = await supabase
          .from('categories')
          .update({ order: currentOrder })
          .eq('id', targetItem.id)
          .eq('user_id', session.user.id)
          .is('household_id', null);

        if (error2) {
          console.error('Error updating target item:', error2);
          throw error2;
        }

        console.log('Move successful');
        await refresh();
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      } catch (error) {
        console.error('Move error:', error);
        Alert.alert('並び替えに失敗しました', error instanceof Error ? error.message : '不明なエラー');
      }
    } else {
      if (currentIndex >= allSiblings.length - 1) {
        Alert.alert('これ以上下に移動できません');
        return;
      }
      const targetItem = allSiblings[currentIndex + 1];
      const targetOrder = targetItem.order ?? 0;
      const currentOrder = item.order ?? 0;

      console.log('Moving down - swapping with:', {
        targetItem: targetItem.name,
        targetOrder,
        currentOrder,
        targetItemOrder: targetItem.order,
        currentItemOrder: item.order
      });

      // 2つのカテゴリのorderを入れ替え
      try {
        const { error: error1 } = await supabase
          .from('categories')
          .update({ order: targetOrder })
          .eq('id', id)
          .eq('user_id', session.user.id)
          .is('household_id', null);

        if (error1) {
          console.error('Error updating current item:', error1);
          throw error1;
        }

        const { error: error2 } = await supabase
          .from('categories')
          .update({ order: currentOrder })
          .eq('id', targetItem.id)
          .eq('user_id', session.user.id)
          .is('household_id', null);

        if (error2) {
          console.error('Error updating target item:', error2);
          throw error2;
        }

        console.log('Move successful');
        await refresh();
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      } catch (error) {
        console.error('Move error:', error);
        Alert.alert('並び替えに失敗しました', error instanceof Error ? error.message : '不明なエラー');
      }
    }
  }, [categories, isParentCategory, session, refresh, queryClient]);

  const renderHeader = useMemo(
    () => (
      <>
        <Text style={styles.title}>カテゴリ管理</Text>
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="カテゴリ名"
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
          />
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.chip, type === 'expense' && styles.chipActive]}
              onPress={() => {
                setType('expense');
                setParentId(null);
              }}>
              <Text style={type === 'expense' ? styles.chipTextActive : styles.chipText}>支出</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, type === 'income' && styles.chipActive]}
              onPress={() => {
                setType('income');
                setParentId(null);
              }}>
              <Text style={type === 'income' ? styles.chipTextActive : styles.chipText}>収入</Text>
            </TouchableOpacity>
          </View>
          {(type === 'expense' || type === 'income') && (
            <View>
              <Text style={styles.label}>親カテゴリ</Text>
              <View style={styles.parentCategoryRow}>
                {currentParentCategories.map((parent) => (
                  <TouchableOpacity
                    key={parent.id}
                    style={[styles.chip, parentId === parent.id && styles.chipActive]}
                    onPress={() => {
                      console.log('Parent category selected:', parent.name, 'id:', parent.id);
                      setParentId(parent.id);
                    }}>
                    <Text style={parentId === parent.id ? styles.chipTextActive : styles.chipText}>
                      {parent.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <TouchableOpacity style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={save} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? '保存中...' : editingId ? '更新' : '追加'}</Text>
          </TouchableOpacity>
          {editingId && (
            <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
              <Text style={styles.cancelText}>キャンセル</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>カテゴリ一覧</Text>
          <TouchableOpacity onPress={refresh}>
            <Text style={styles.refreshText}>{loading ? '更新中...' : '再読込'}</Text>
          </TouchableOpacity>
        </View>
      </>
    ),
    [name, type, parentId, saving, editingId, loading, currentParentCategories, save, resetForm, refresh]
  );

  const renderItem = useCallback(({ item, index }: { item: Category; index: number }) => {
    const isChild = item.parent_id !== null;
    const parentName = isChild ? categories.find(c => c.id === item.parent_id)?.name : null;

    // 同じ親カテゴリの子カテゴリを取得して順序を確認
    const siblings = sorted.filter(c => c.parent_id === item.parent_id);
    const currentIndex = siblings.findIndex(s => s.id === item.id);
    const canMoveUp = !isParentCategory(item) && currentIndex > 0;
    const canMoveDown = !isParentCategory(item) && currentIndex < siblings.length - 1;

    return (
      <View style={[styles.item, isChild && styles.childItem]}>
        <View style={styles.itemLeft}>
          <Text style={styles.itemName}>
            {isChild ? `  └ ${item.name}` : item.name}
          </Text>
          <Text style={styles.itemType}>
            {item.type === 'expense' ? '支出' : '収入'}
            {parentName && ` / ${parentName}`}
          </Text>
        </View>
        <View style={styles.itemActions}>
          {!isParentCategory(item) && (
            <>
              <View style={styles.orderButtons}>
                <TouchableOpacity
                  onPress={() => moveCategory(item.id, 'up')}
                  style={[styles.orderButton, !canMoveUp && styles.orderButtonDisabled]}
                  disabled={!canMoveUp}>
                  <Text style={[styles.orderButtonText, !canMoveUp && styles.orderButtonTextDisabled]}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveCategory(item.id, 'down')}
                  style={[styles.orderButton, !canMoveDown && styles.orderButtonDisabled]}
                  disabled={!canMoveDown}>
                  <Text style={[styles.orderButtonText, !canMoveDown && styles.orderButtonTextDisabled]}>↓</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => onEdit(item)} style={styles.itemButton}>
                <Text>編集</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(item.id)} style={[styles.itemButton, styles.deleteButton]}>
                <Text style={styles.deleteText}>削除</Text>
              </TouchableOpacity>
            </>
          )}
          {isParentCategory(item) && (
            <Text style={styles.disabledText}>編集・削除不可</Text>
          )}
        </View>
      </View>
    );
  }, [categories, sorted, isParentCategory, onEdit, onDelete, moveCategory]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        renderItem={({ item, index }) => renderItem({ item, index })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text>カテゴリがありません。追加してください。</Text>
          </View>
        }
        contentContainerStyle={sorted.length === 0 ? styles.emptyContainer : styles.listContent}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  form: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  parentCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipActive: {
    backgroundColor: '#2f95dc',
    borderColor: '#2f95dc',
  },
  chipText: {
    color: '#333',
  },
  chipTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#2f95dc',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    padding: 8,
  },
  cancelText: {
    color: '#666',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  refreshText: {
    color: '#2f95dc',
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    marginBottom: 8,
  },
  childItem: {
    marginLeft: 16,
    backgroundColor: '#f9f9f9',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  itemType: {
    color: '#666',
    marginTop: 4,
  },
  itemLeft: {
    flex: 1,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  orderButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  orderButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderButtonDisabled: {
    opacity: 0.3,
    backgroundColor: '#f9fafb',
  },
  orderButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  orderButtonTextDisabled: {
    color: '#9ca3af',
  },
  itemButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f2f2f2',
  },
  deleteButton: {
    backgroundColor: '#ffe5e5',
  },
  deleteText: {
    color: '#c00',
    fontWeight: '600',
  },
  disabledText: {
    color: '#9ca3af',
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
