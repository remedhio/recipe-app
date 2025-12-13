import { useEffect, useMemo, useState } from 'react';
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
    () => categories.filter(c => c.type === 'expense' && c.parent_id === null),
    [categories]
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

    // 支出: 親カテゴリごとにグループ化
    parentCategories.forEach(parent => {
      result.push(parent);
      const children = childCategories.filter(c => c.parent_id === parent.id);
      result.push(...children.sort((a, b) => a.name.localeCompare(b.name)));
    });

    // 収入カテゴリ
    result.push(...incomeCategories.sort((a, b) => a.name.localeCompare(b.name)));

    return result;
  }, [parentCategories, childCategories, incomeCategories]);

  useEffect(() => {
    if (session) {
      refresh();
      // 支出の親カテゴリ（固定費、変動費、投資）が存在しない場合は作成
      ensureExpenseParentCategories();
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

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('categories').select('*');
    setLoading(false);
    if (error) {
      Alert.alert('取得に失敗しました', error.message);
      return;
    }
    setCategories((data ?? []) as Category[]);
  };

  const resetForm = () => {
    setName('');
    setType('expense');
    setParentId(null);
    setEditingId(null);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('名前を入力してください');
      return;
    }

    // 支出カテゴリで親カテゴリが選択されていない場合はエラー
    if (type === 'expense' && !parentId) {
      Alert.alert('親カテゴリを選択してください', '支出カテゴリは「固定費」「変動費」「投資」のいずれかを選択してください');
      return;
    }

    setSaving(true);
    if (editingId) {
      const { error } = await supabase
        .from('categories')
        .update({ name, type, parent_id: type === 'expense' ? parentId : null })
        .eq('id', editingId);
      setSaving(false);
      if (error) {
        Alert.alert('更新に失敗しました', error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('categories').insert({
        name,
        type,
        parent_id: type === 'expense' ? parentId : null,
        user_id: session?.user?.id
      });
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
  };

  const onEdit = (item: Category) => {
    setEditingId(item.id);
    setName(item.name);
    setType(item.type);
    setParentId(item.parent_id);
  };

  const onDelete = async (id: string) => {
    Alert.alert('削除確認', 'このカテゴリを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('categories').delete().eq('id', id);
          if (error) {
            Alert.alert('削除に失敗しました', error.message);
            return;
          }
          refresh();
          if (editingId === id) resetForm();
        },
      },
    ]);
  };

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
          {type === 'expense' && (
            <View>
              <Text style={styles.label}>親カテゴリ</Text>
              <View style={styles.parentCategoryRow}>
                {parentCategories.map((parent) => (
                  <TouchableOpacity
                    key={parent.id}
                    style={[styles.chip, parentId === parent.id && styles.chipActive]}
                    onPress={() => setParentId(parent.id)}>
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
    [name, type, parentId, saving, editingId, loading, parentCategories]
  );

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
        renderItem={({ item }) => {
          const isChild = item.parent_id !== null;
          const parentName = isChild ? categories.find(c => c.id === item.parent_id)?.name : null;

          return (
            <View style={[styles.item, isChild && styles.childItem]}>
              <View>
                <Text style={styles.itemName}>
                  {isChild ? `  └ ${item.name}` : item.name}
                </Text>
                <Text style={styles.itemType}>
                  {item.type === 'expense' ? '支出' : '収入'}
                  {parentName && ` / ${parentName}`}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => onEdit(item)} style={styles.itemButton}>
                  <Text>編集</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(item.id)} style={[styles.itemButton, styles.deleteButton]}>
                  <Text style={styles.deleteText}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
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
  itemActions: {
    flexDirection: 'row',
    gap: 8,
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
