import { Request, Response } from 'express';
import { db } from '../db';
import { categories } from '../db/schema';
import { eq } from 'drizzle-orm';

export const categoriesHandler = {
  getCategories: async (req: Request, res: Response) => {
    try {
      const categoryResults = await db
        .select()
        .from(categories)
        .where(eq(categories.isActive, true));

      res.status(200).json(categoryResults.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        is_active: c.isActive,
      })));
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  createCategory: async (req: Request, res: Response) => {
    try {
      const { name, icon, color } = req.body;

      const categoryResult = await db
        .insert(categories)
        .values({ name, icon, color })
        .returning();

      const category = categoryResult[0];

      res.status(201).json({
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
        is_active: category.isActive,
      });
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateCategory: async (req: Request, res: Response) => {
    try {
      const { categoryId } = req.params;
      const { name, icon, color, is_active } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (icon !== undefined) updateData.icon = icon;
      if (color !== undefined) updateData.color = color;
      if (is_active !== undefined) updateData.isActive = is_active;

      const categoryResult = await db
        .update(categories)
        .set(updateData)
        .where(eq(categories.id, categoryId))
        .returning();

      if (categoryResult.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      const category = categoryResult[0];

      res.status(200).json({
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
        is_active: category.isActive,
      });
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  deleteCategory: async (req: Request, res: Response) => {
    try {
      const { categoryId } = req.params;

      // Soft delete
      const result = await db
        .update(categories)
        .set({ isActive: false })
        .where(eq(categories.id, categoryId))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
